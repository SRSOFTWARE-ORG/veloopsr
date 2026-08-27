import { supabase } from "@/integrations/supabase/client";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

export type ResilientLoginResult = {
  ok: boolean;
  email?: string | null;
  /** Motivo legível quando ok = false */
  error?: string;
  /** true quando o backend não respondeu (pausado/offline/instável) */
  backendDown?: boolean;
  attempts: number;
};

const withTimeout = async <T,>(p: Promise<T>, ms: number): Promise<T> =>
  await Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)),
  ]);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const isCredentialError = (msg: string) => {
  const m = msg.toLowerCase();
  return (
    m.includes("invalid login") ||
    m.includes("invalid credentials") ||
    m.includes("email not confirmed") ||
    m.includes("credenciais")
  );
};

/** Login direto no endpoint REST de auth — não depende do estado do client SDK. */
const restLogin = async (email: string, password: string, timeoutMs: number) => {
  const res = await withTimeout(
    fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SUPABASE_KEY },
      body: JSON.stringify({ email, password }),
      cache: "no-store",
    }),
    timeoutMs,
  );

  const json = await res.json().catch(() => ({}) as Record<string, unknown>);
  if (!res.ok) {
    const msg =
      (json as { error_description?: string; msg?: string; message?: string }).error_description ||
      (json as { msg?: string }).msg ||
      (json as { message?: string }).message ||
      `HTTP ${res.status}`;
    const err = new Error(msg);
    // 4xx com corpo de erro = credencial/estado do usuário, não queda de backend
    (err as Error & { credential?: boolean }).credential =
      res.status >= 400 && res.status < 500 && isCredentialError(msg);
    throw err;
  }

  const { access_token, refresh_token } = json as {
    access_token?: string;
    refresh_token?: string;
  };
  if (!access_token || !refresh_token) throw new Error("Resposta de autenticação inválida");

  await supabase.auth.setSession({ access_token, refresh_token });
  const { data } = await supabase.auth.getUser();
  return data.user?.email ?? email;
};

/**
 * Login de emergência da aba /acesso.
 * Nunca pode "travar": cada tentativa tem timeout curto, alterna entre o SDK
 * e o endpoint REST e repete com backoff enquanto o backend estiver instável.
 */
export const resilientSignIn = async (
  email: string,
  password: string,
  opts: { attempts?: number; timeoutMs?: number; onAttempt?: (n: number) => void } = {},
): Promise<ResilientLoginResult> => {
  const maxAttempts = opts.attempts ?? 4;
  const timeoutMs = opts.timeoutMs ?? 8000;
  let lastError = "Não foi possível entrar";

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    opts.onAttempt?.(attempt);
    try {
      if (attempt % 2 === 1) {
        const { data, error } = await withTimeout(
          supabase.auth.signInWithPassword({ email, password }),
          timeoutMs,
        );
        if (error) throw Object.assign(new Error(error.message), {
          credential: isCredentialError(error.message),
        });
        return { ok: true, email: data.user?.email ?? email, attempts: attempt };
      }

      const logged = await restLogin(email, password, timeoutMs);
      return { ok: true, email: logged, attempts: attempt };
    } catch (err) {
      const e = err as Error & { credential?: boolean };
      lastError = e.message || lastError;
      if (e.credential) {
        return { ok: false, error: "E-mail ou senha incorretos.", attempts: attempt };
      }
      if (attempt < maxAttempts) await sleep(Math.min(1000 * attempt, 3000));
    }
  }

  return {
    ok: false,
    attempts: maxAttempts,
    backendDown: true,
    error: navigator.onLine
      ? "O servidor de autenticação não respondeu. Tentando novamente automaticamente…"
      : "Sem conexão com a internet.",
  };
};

/** Sessão salva localmente, usada quando o servidor está fora e o usuário já entrou antes. */
export const getCachedSessionEmail = async (): Promise<string | null> => {
  try {
    const { data } = await withTimeout(supabase.auth.getSession(), 4000);
    return data.session?.user?.email ?? null;
  } catch {
    return null;
  }
};

import { supabase } from "@/integrations/supabase/client";
import { flushLoginDiagnostics, recordLoginDiagnostic, type LoginOutcome } from "@/lib/login-audit";

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

const withTimeout = async <T,>(p: Promise<T>, ms: number): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([p, new Promise<T>((_, reject) => {
      timer = setTimeout(() => reject(new Error("timeout")), ms);
    })]);
  } finally { clearTimeout(timer); }
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Login direto no endpoint REST de auth — não depende do estado do client SDK. */
const restLogin = async (email: string, password: string, timeoutMs: number) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let json: Record<string, unknown>;
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SUPABASE_KEY },
      body: JSON.stringify({ email, password }),
      cache: "no-store",
      signal: controller.signal,
    });
    json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      (json as { error_description?: string; msg?: string; message?: string }).error_description ||
      (json as { msg?: string }).msg ||
      (json as { message?: string }).message ||
      `HTTP ${res.status}`;
    const err = new Error(msg);
    const code = String(json.code || json.error_code || "");
    (err as Error & { outcome?: LoginOutcome }).outcome =
      res.status === 429 ? "rate_limited" : code === "email_not_confirmed" || msg.toLowerCase().includes("email not confirmed")
        ? "email_unconfirmed" : res.status === 400 || res.status === 401 ? "credentials_rejected" : "unavailable";
    throw err;
  }
  } finally { clearTimeout(timer); }

  const { access_token, refresh_token } = json as {
    access_token?: string;
    refresh_token?: string;
  };
  if (!access_token || !refresh_token) throw new Error("Resposta de autenticação inválida");

  try {
    const result = await withTimeout(supabase.auth.setSession({ access_token, refresh_token }), timeoutMs);
    if (result.error) throw result.error;
    const { data, error } = await withTimeout(supabase.auth.getUser(), timeoutMs);
    if (error || !data.user) throw new Error("Session validation failed");
    return data.user.email ?? email;
  } catch {
    throw Object.assign(new Error("Session validation failed"), { outcome: "session_failed" });
  }
};

/**
 * Login de emergência da aba /acesso.
 * Requisições canceláveis e sequenciais; sem alternar operações SDK concorrentes.
 */
export const resilientSignIn = async (
  email: string,
  password: string,
  opts: { attempts?: number; timeoutMs?: number; onAttempt?: (n: number) => void } = {},
): Promise<ResilientLoginResult> => {
  const maxAttempts = opts.attempts ?? 4;
  const timeoutMs = opts.timeoutMs ?? 8000;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    opts.onAttempt?.(attempt);
    try {
      const logged = await restLogin(email.trim().toLowerCase(), password, timeoutMs);
      recordLoginDiagnostic("success", attempt);
      void flushLoginDiagnostics();
      return { ok: true, email: logged, attempts: attempt };
    } catch (err) {
      const outcome = (err as { outcome?: LoginOutcome }).outcome || "unavailable";
      if (outcome !== "unavailable") {
        recordLoginDiagnostic(outcome, attempt);
        const messages = {
          credentials_rejected: "E-mail ou senha incorretos.",
          email_unconfirmed: "Confirme seu e-mail antes de entrar.",
          rate_limited: "Muitas tentativas de login. Aguarde alguns minutos antes de tentar novamente.",
          session_failed: "Não foi possível validar a sessão. Tente entrar novamente.",
          success: "",
        };
        return { ok: false, error: messages[outcome], attempts: attempt };
      }
      if (attempt < maxAttempts) await sleep(Math.min(1000 * attempt, 3000));
    }
  }

  recordLoginDiagnostic("unavailable", maxAttempts);
  return {
    ok: false,
    attempts: maxAttempts,
    backendDown: true,
    error: navigator.onLine
      ? "Login indisponível: o serviço não respondeu. Se persistir, o administrador precisa verificar o Lovable Cloud."
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

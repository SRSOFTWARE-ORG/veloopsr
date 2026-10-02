import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const BUCKET = "produto_imagens";
const PATH = "app-config/maintenance.json";

export type MaintenanceAudit = {
  action: "ativado" | "desativado" | "agenda" | "bypass" | "acesso" | "whatsapp";
  by: string;
  at: string;
  detalhe?: string;
};

export type MaintenanceConfig = {
  manutencao: boolean;
  updated_at: string;
  schedule?: {
    enabled: boolean;
    /** "HH:MM" horário de ativação (fuso America/Sao_Paulo) */
    start: string;
    /** "HH:MM" horário de desativação */
    end: string;
  };
  bypass_emails?: string[];
  /** Quando true, todos os envios de WhatsApp ficam pausados. */
  whatsapp_offline?: boolean;
  audit?: MaintenanceAudit[];
};

export const emptyConfig: MaintenanceConfig = {
  manutencao: false,
  updated_at: new Date(0).toISOString(),
  schedule: { enabled: false, start: "23:00", end: "05:00" },
  bypass_emails: [],
  whatsapp_offline: true,
  audit: [],
};

const publicUrl = () =>
  supabase.storage.from(BUCKET).getPublicUrl(PATH).data.publicUrl;

/** Minutos desde a meia-noite no fuso de São Paulo. */
const nowMinutesSP = () => {
  const parts = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return h * 60 + m;
};

const toMinutes = (hhmm?: string) => {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(":").map((n) => Number(n));
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
};

/** A janela agendada está ativa agora? (suporta janelas que cruzam a meia-noite) */
export const isScheduleActive = (config: MaintenanceConfig | null): boolean => {
  const s = config?.schedule;
  if (!s?.enabled) return false;
  const start = toMinutes(s.start);
  const end = toMinutes(s.end);
  if (start === null || end === null || start === end) return false;
  const now = nowMinutesSP();
  return start < end ? now >= start && now < end : now >= start || now < end;
};

/** Estado efetivo: manual OU dentro da janela agendada. */
export const isMaintenanceActive = (config: MaintenanceConfig | null): boolean =>
  Boolean(config?.manutencao) || isScheduleActive(config);

/** WhatsApp fica offline até ser explicitamente reativado nas configurações. */
export const isWhatsappOffline = (config: MaintenanceConfig | null): boolean =>
  config?.whatsapp_offline !== false;

export const canBypass = (config: MaintenanceConfig | null, email?: string | null) => {
  if (!email) return false;
  const list = (config?.bypass_emails ?? []).map((e) => e.trim().toLowerCase());
  return list.includes(email.trim().toLowerCase());
};

const CACHE_KEY = "veloop.maintenance.cache";

const readCache = (): MaintenanceConfig => {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? { ...emptyConfig, ...(JSON.parse(raw) as MaintenanceConfig) } : emptyConfig;
  } catch {
    return emptyConfig;
  }
};

export const readMaintenanceConfig = async (): Promise<MaintenanceConfig> => {
  try {
    // Timeout curto: o backend pode estar lento/reiniciando e não podemos travar a UI.
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 8000);
    const res = await fetch(`${publicUrl()}?t=${Date.now()}`, {
      cache: "no-store",
      signal: controller.signal,
    });
    window.clearTimeout(timer);
    // 5xx/timeout do storage não deve ser tratado como "config vazia":
    // mantemos o último estado conhecido para não oscilar o app.
    if (!res.ok) return res.status >= 500 ? readCache() : emptyConfig;
    const json = (await res.json()) as MaintenanceConfig;
    const config = { ...emptyConfig, ...json };
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(config));
    } catch {
      // storage local indisponível — segue sem cache
    }
    return config;
  } catch {
    return readCache();
  }
};


export const readMaintenance = async (): Promise<boolean> =>
  isMaintenanceActive(await readMaintenanceConfig());

export const writeMaintenanceConfig = async (config: MaintenanceConfig) => {
  const body = new Blob([JSON.stringify({ ...config, updated_at: new Date().toISOString() })], {
    type: "application/json",
  });

  // O servidor pode oscilar logo após reiniciar (ex.: "Internal Server Error").
  // Tentamos até 4 vezes com espera crescente antes de mostrar erro ao usuário.
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    const { error } = await supabase.storage.from(BUCKET).upload(PATH, body, {
      upsert: true,
      contentType: "application/json",
      cacheControl: "0",
    });
    if (!error) return;
    lastError = error;
    const msg = String((error as { message?: string }).message ?? "");
    const transient = /internal server error|timeout|fetch|network|50\d|gateway/i.test(msg);
    if (!transient) break;
    await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
  }
  throw new Error(
    "Servidor instável — não foi possível salvar agora. Tente novamente em instantes.",
    { cause: lastError },
  );
};

/** Grava mantendo histórico de auditoria (últimos 100 registros). */
export const saveMaintenance = async (
  current: MaintenanceConfig,
  patch: Partial<MaintenanceConfig>,
  audit: MaintenanceAudit,
) => {
  const next: MaintenanceConfig = {
    ...current,
    ...patch,
    audit: [audit, ...(current.audit ?? [])].slice(0, 100),
  };
  await writeMaintenanceConfig(next);
  return next;
};

/**
 * Registra um evento de auditoria sem alterar o estado da manutenção.
 * Grava no JSON de configuração e, em paralelo (best-effort), no audit_log do banco.
 */
export const appendMaintenanceAudit = async (entry: MaintenanceAudit) => {
  try {
    const current = await readMaintenanceConfig();
    await writeMaintenanceConfig({
      ...current,
      audit: [entry, ...(current.audit ?? [])].slice(0, 100),
    });
  } catch {
    // storage indisponível — a auditoria no banco abaixo ainda pode funcionar
  }

  try {
    const { data } = await supabase.auth.getUser();
    await supabase.from("audit_log").insert({
      user_id: data.user?.id,
      acao: `manutencao:${entry.action}`,
      tabela: "app_config_manutencao",
      detalhes: entry as unknown as never,
    });
  } catch {
    // auditoria em banco é complementar; nunca deve bloquear o acesso
  }
};

export const writeMaintenance = async (manutencao: boolean) => {
  const current = await readMaintenanceConfig();
  await writeMaintenanceConfig({ ...current, manutencao });
};

/** Estado global de "app fora do ar", com verificação periódica. */
export const useMaintenanceMode = (intervalMs = 3000) => {
  const [config, setConfig] = useState<MaintenanceConfig>(emptyConfig);
  const [manutencao, setManutencao] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const cfg = await readMaintenanceConfig();
    setConfig(cfg);
    const active = isMaintenanceActive(cfg);
    setManutencao(active);
    setLoading(false);
    return active;
  }, []);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), intervalMs);
    const onFocus = () => void refresh();
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh, intervalMs]);

  return { manutencao, config, setConfig, loading, refresh, setManutencao };
};

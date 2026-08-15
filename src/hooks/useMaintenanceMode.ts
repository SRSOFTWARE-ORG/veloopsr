import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const BUCKET = "produto_imagens";
const PATH = "app-config/maintenance.json";

export type MaintenanceAudit = {
  action: "ativado" | "desativado" | "agenda" | "bypass" | "acesso";
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
  audit?: MaintenanceAudit[];
};

export const emptyConfig: MaintenanceConfig = {
  manutencao: false,
  updated_at: new Date(0).toISOString(),
  schedule: { enabled: false, start: "23:00", end: "05:00" },
  bypass_emails: [],
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

export const canBypass = (config: MaintenanceConfig | null, email?: string | null) => {
  if (!email) return false;
  const list = (config?.bypass_emails ?? []).map((e) => e.trim().toLowerCase());
  return list.includes(email.trim().toLowerCase());
};

export const readMaintenanceConfig = async (): Promise<MaintenanceConfig> => {
  try {
    const res = await fetch(`${publicUrl()}?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return emptyConfig;
    const json = (await res.json()) as MaintenanceConfig;
    return { ...emptyConfig, ...json };
  } catch {
    return emptyConfig;
  }
};

export const readMaintenance = async (): Promise<boolean> =>
  isMaintenanceActive(await readMaintenanceConfig());

export const writeMaintenanceConfig = async (config: MaintenanceConfig) => {
  const body = new Blob([JSON.stringify({ ...config, updated_at: new Date().toISOString() })], {
    type: "application/json",
  });

  const { error } = await supabase.storage.from(BUCKET).upload(PATH, body, {
    upsert: true,
    contentType: "application/json",
    cacheControl: "0",
  });

  if (error) throw error;
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
      detalhes: entry as unknown as Record<string, unknown>,
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
export const useMaintenanceMode = (intervalMs = 15000) => {
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
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh, intervalMs]);

  return { manutencao, config, setConfig, loading, refresh, setManutencao };
};

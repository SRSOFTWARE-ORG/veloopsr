// Helper compartilhado: verifica se o app está em "modo fora do ar".
// Quando ativo, filas, jobs e webhooks de vendas/atualizações ficam pausados.

const CONFIG_URL = `${Deno.env.get("SUPABASE_URL")}/storage/v1/object/public/produto_imagens/app-config/maintenance.json`;

type MaintenanceConfig = {
  manutencao?: boolean;
  schedule?: { enabled?: boolean; start?: string; end?: string };
};

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
  const [h, m] = hhmm.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
};

export async function isMaintenanceActive(): Promise<boolean> {
  try {
    const res = await fetch(`${CONFIG_URL}?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return false;
    const cfg = (await res.json()) as MaintenanceConfig;
    if (cfg?.manutencao === true) return true;

    const s = cfg?.schedule;
    if (!s?.enabled) return false;
    const start = toMinutes(s.start);
    const end = toMinutes(s.end);
    if (start === null || end === null || start === end) return false;
    const now = nowMinutesSP();
    return start < end ? now >= start && now < end : now >= start || now < end;
  } catch {
    return false;
  }
}

/** Retorna uma Response 503 pronta quando o modo fora do ar estiver ativo. */
export async function maintenanceGuard(headers: Record<string, string> = {}) {
  if (!(await isMaintenanceActive())) return null;
  return new Response(
    JSON.stringify({ paused: true, reason: "Modo fora do ar ativo — serviços pausados" }),
    { status: 503, headers: { ...headers, "Content-Type": "application/json" } },
  );
}

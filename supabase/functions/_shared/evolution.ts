// Helpers para Evolution API (UAZAPI desligada — usar apenas Evolution).
// Secrets: EVOLUTION_API_URL, EVOLUTION_API_KEY, EVOLUTION_INSTANCE (opcional).
//
// MULTI-TENANT (CRÍTICO):
// - SEMPRE bloqueia instâncias da BARBEARIA DO JEFFÃO (compartilham o mesmo servidor).
// - Se EVOLUTION_INSTANCE não estiver definida OU não existir mais no servidor,
//   resolvemos automaticamente a 1ª instância DISPONÍVEL e não-bloqueada
//   (preferindo nomes que contenham "veloop" / "sr" / "srsoftware").
// - O resultado é cacheado em memória por 5 minutos para não martelar o Evolution.

const INSTANCE_BLOCKLIST = ["jeffao", "jeffão", "barbearia"];
const INSTANCE_PREFERLIST = ["veloop", "srsoftware", "sr software", "sr-software", "sr_software", " sr "];

const RESOLVE_TTL_MS = 5 * 60 * 1000;
let _cachedInstance: string | null = null;
let _cachedAt = 0;

function _isBlocked(name: string): boolean {
  const n = name.trim().toLowerCase();
  if (!n) return false;
  return INSTANCE_BLOCKLIST.some((b) => n.includes(b));
}

function _looksPreferred(name: string): boolean {
  const n = ` ${name.trim().toLowerCase()} `;
  return INSTANCE_PREFERLIST.some((p) => n.includes(p));
}

function _baseCfg() {
  const url = (Deno.env.get("EVOLUTION_API_URL") || "").replace(/\/+$/, "");
  const key = Deno.env.get("EVOLUTION_API_KEY") || "";
  const configured = (Deno.env.get("EVOLUTION_INSTANCE") || "").trim();
  return { url, key, configured };
}

/** Lista instâncias disponíveis no servidor Evolution. */
async function _fetchInstances(url: string, key: string): Promise<{ name: string; state?: string }[]> {
  try {
    const res = await fetch(`${url}/instance/fetchInstances`, { headers: { apikey: key } });
    if (!res.ok) return [];
    const data: any = await res.json();
    const arr: any[] = Array.isArray(data) ? data : (Array.isArray(data?.instances) ? data.instances : []);
    return arr
      .map((it) => {
        const inner = it?.instance || it;
        const name = inner?.instanceName || inner?.name || it?.name || "";
        const state = inner?.state || it?.state || it?.connectionStatus;
        return { name: String(name || ""), state: state ? String(state) : undefined };
      })
      .filter((it) => !!it.name);
  } catch {
    return [];
  }
}

/** Verifica diretamente se UMA instância existe e responde. */
async function _checkInstance(url: string, key: string, instance: string): Promise<boolean> {
  try {
    const r = await fetch(`${url}/instance/connectionState/${encodeURIComponent(instance)}`, {
      headers: { apikey: key },
    });
    return r.ok;
  } catch {
    return false;
  }
}

/**
 * Resolve a instância correta. Ordem:
 * 1. EVOLUTION_INSTANCE configurada, desde que não esteja na blocklist e exista no servidor.
 * 2. Primeira instância do servidor que combine com a PREFER LIST e não esteja bloqueada.
 * 3. Primeira instância não bloqueada (fallback).
 */
async function resolveInstance(): Promise<{ instance: string | null; reason?: string }> {
  const { url, key, configured } = _baseCfg();
  if (!url || !key) return { instance: null, reason: "EVOLUTION_API_URL/KEY ausentes" };

  // cache válido?
  if (_cachedInstance && Date.now() - _cachedAt < RESOLVE_TTL_MS) {
    if (!_isBlocked(_cachedInstance)) return { instance: _cachedInstance };
  }

  // 1) tentar a configurada
  if (configured && !_isBlocked(configured)) {
    const ok = await _checkInstance(url, key, configured);
    if (ok) {
      _cachedInstance = configured;
      _cachedAt = Date.now();
      return { instance: configured };
    }
  }

  // 2/3) autodetectar
  const list = await _fetchInstances(url, key);
  const allowed = list.filter((i) => !_isBlocked(i.name));
  if (allowed.length === 0) {
    return { instance: null, reason: "Nenhuma instância disponível (todas bloqueadas ou servidor vazio)" };
  }
  const preferred = allowed.find((i) => _looksPreferred(i.name)) || allowed[0];
  _cachedInstance = preferred.name;
  _cachedAt = Date.now();
  console.log("[evolution] instância resolvida automaticamente:", preferred.name);
  return { instance: preferred.name };
}

export async function evolutionConfigured(): Promise<boolean> {
  const { url, key } = _baseCfg();
  if (!url || !key) return false;
  const r = await resolveInstance();
  return !!r.instance;
}

export function normalizeBrPhone(phone: string): string {
  let p = String(phone || "").replace(/\D/g, "");
  if (p.startsWith("0")) p = p.replace(/^0+/, "");
  if (!p.startsWith("55")) p = "55" + p;
  return p;
}

export type EvoResult = { ok: boolean; status: number; data?: any; error?: string };

import { isWhatsappPaused } from "./maintenance.ts";

export const WHATSAPP_PAUSED_ERROR = "WhatsApp desativado nas configurações do app";

async function _getReadyCfg(): Promise<{ url: string; key: string; instance: string } | { error: string }> {
  const { url, key } = _baseCfg();
  if (!url || !key) return { error: "Evolution API não configurada (EVOLUTION_API_URL/KEY)" };
  const r = await resolveInstance();
  if (!r.instance) return { error: r.reason || "Nenhuma instância Evolution disponível" };
  if (_isBlocked(r.instance)) return { error: `Instância "${r.instance}" bloqueada (Barbearia do Jeffão)` };
  return { url, key, instance: r.instance };
}

export async function evoSendText(phone: string, text: string): Promise<EvoResult> {
  if (await isWhatsappPaused()) return { ok: false, status: 423, error: WHATSAPP_PAUSED_ERROR };
  const cfg = await _getReadyCfg();
  if ("error" in cfg) return { ok: false, status: 403, error: cfg.error };
  try {
    const res = await fetch(`${cfg.url}/message/sendText/${encodeURIComponent(cfg.instance)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: cfg.key },
      body: JSON.stringify({ number: normalizeBrPhone(phone), text, linkPreview: false }),
    });
    const raw = await res.text();
    let data: any = null;
    try { data = raw ? JSON.parse(raw) : null; } catch { data = raw; }
    if (!res.ok) return { ok: false, status: res.status, data, error: (data && (data.message || data.error)) || `HTTP ${res.status}` };
    return { ok: true, status: res.status, data };
  } catch (e) {
    return { ok: false, status: 500, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function evoSendMedia(opts: {
  phone: string;
  mediatype: "document" | "image" | "video";
  media: string;
  fileName?: string;
  caption?: string;
  mimetype?: string;
}): Promise<EvoResult> {
  if (await isWhatsappPaused()) return { ok: false, status: 423, error: WHATSAPP_PAUSED_ERROR };
  const cfg = await _getReadyCfg();
  if ("error" in cfg) return { ok: false, status: 403, error: cfg.error };
  try {
    const res = await fetch(`${cfg.url}/message/sendMedia/${encodeURIComponent(cfg.instance)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: cfg.key },
      body: JSON.stringify({
        number: normalizeBrPhone(opts.phone),
        mediatype: opts.mediatype,
        media: opts.media,
        fileName: opts.fileName,
        caption: opts.caption,
        mimetype: opts.mimetype,
      }),
    });
    const raw = await res.text();
    let data: any = null;
    try { data = raw ? JSON.parse(raw) : null; } catch { data = raw; }
    if (!res.ok) return { ok: false, status: res.status, data, error: (data && (data.message || data.error)) || `HTTP ${res.status}` };
    return { ok: true, status: res.status, data };
  } catch (e) {
    return { ok: false, status: 500, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function evoSendAudio(phone: string, audioBase64OrUrl: string): Promise<EvoResult> {
  if (await isWhatsappPaused()) return { ok: false, status: 423, error: WHATSAPP_PAUSED_ERROR };
  const cfg = await _getReadyCfg();
  if ("error" in cfg) return { ok: false, status: 403, error: cfg.error };
  try {
    const res = await fetch(`${cfg.url}/message/sendWhatsAppAudio/${encodeURIComponent(cfg.instance)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: cfg.key },
      body: JSON.stringify({ number: normalizeBrPhone(phone), audio: audioBase64OrUrl }),
    });
    const raw = await res.text();
    let data: any = null;
    try { data = raw ? JSON.parse(raw) : null; } catch { data = raw; }
    if (!res.ok) return { ok: false, status: res.status, data, error: `HTTP ${res.status}` };
    return { ok: true, status: res.status, data };
  } catch (e) {
    return { ok: false, status: 500, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function evoConnectionState(): Promise<{ ok: boolean; connected: boolean; state: string; instance?: string; raw?: any }> {
  const cfg = await _getReadyCfg();
  if ("error" in cfg) return { ok: false, connected: false, state: "not_configured" };
  try {
    const res = await fetch(`${cfg.url}/instance/connectionState/${encodeURIComponent(cfg.instance)}`, {
      headers: { apikey: cfg.key },
    });
    if (!res.ok) return { ok: false, connected: false, state: `http_${res.status}`, instance: cfg.instance };
    const data = await res.json();
    const state = data?.instance?.state || data?.state || "unknown";
    return { ok: true, connected: state === "open", state, instance: cfg.instance, raw: data };
  } catch (e) {
    return { ok: false, connected: false, state: "error", instance: cfg.instance };
  }
}

export async function evoConnect(): Promise<{ ok: boolean; status: number; qrcode?: string | null; state?: string; instance?: string; raw?: any }> {
  const cfg = await _getReadyCfg();
  if ("error" in cfg) return { ok: false, status: 403, raw: { error: cfg.error } };
  try {
    const res = await fetch(`${cfg.url}/instance/connect/${encodeURIComponent(cfg.instance)}`, {
      headers: { apikey: cfg.key },
    });
    const raw = await res.text();
    let data: any = {};
    try { data = raw ? JSON.parse(raw) : {}; } catch { data = { raw }; }
    let qr: string | null = data?.base64 || data?.qrcode || data?.qr || null;
    if (qr && !qr.startsWith("data:")) qr = `data:image/png;base64,${qr}`;
    return { ok: res.ok, status: res.status, qrcode: qr, state: data?.instance?.state, instance: cfg.instance, raw: data };
  } catch (e) {
    return { ok: false, status: 500, raw: { error: e instanceof Error ? e.message : String(e) } };
  }
}

export async function evoDownloadMediaBase64(messagePayload: any): Promise<string | null> {
  const cfg = await _getReadyCfg();
  if ("error" in cfg) return null;
  try {
    const res = await fetch(`${cfg.url}/chat/getBase64FromMediaMessage/${encodeURIComponent(cfg.instance)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: cfg.key },
      body: JSON.stringify({ message: messagePayload, convertToMp4: false }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.base64 || data?.data || null;
  } catch {
    return null;
  }
}

export function evoVerifyWebhook(req: Request, body: any): boolean {
  const expected = Deno.env.get("EVOLUTION_API_KEY") || "";
  if (!expected) return false;
  const received =
    req.headers.get("apikey") ||
    req.headers.get("x-evolution-apikey") ||
    body?.apikey ||
    body?.token ||
    "";
  return !!received && received === expected;
}

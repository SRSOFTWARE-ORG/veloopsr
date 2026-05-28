// Helpers para Evolution API (substitui UAZAPI)
// Requer secrets: EVOLUTION_API_URL, EVOLUTION_API_KEY, EVOLUTION_INSTANCE

function getCfg() {
  const url = (Deno.env.get("EVOLUTION_API_URL") || "").replace(/\/+$/, "");
  const key = Deno.env.get("EVOLUTION_API_KEY") || "";
  const instance = Deno.env.get("EVOLUTION_INSTANCE") || "";
  return { url, key, instance };
}

export function evolutionConfigured(): boolean {
  const { url, key, instance } = getCfg();
  return !!url && !!key && !!instance;
}

export function normalizeBrPhone(phone: string): string {
  let p = String(phone || "").replace(/\D/g, "");
  if (p.startsWith("0")) p = p.replace(/^0+/, "");
  if (!p.startsWith("55")) p = "55" + p;
  return p;
}

export type EvoResult = { ok: boolean; status: number; data?: any; error?: string };

export async function evoSendText(phone: string, text: string): Promise<EvoResult> {
  const { url, key, instance } = getCfg();
  if (!url || !key || !instance) {
    return { ok: false, status: 500, error: "Evolution API não configurada (EVOLUTION_API_URL, EVOLUTION_API_KEY, EVOLUTION_INSTANCE)" };
  }
  try {
    const res = await fetch(`${url}/message/sendText/${encodeURIComponent(instance)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: key },
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
  media: string; // URL ou base64
  fileName?: string;
  caption?: string;
  mimetype?: string;
}): Promise<EvoResult> {
  const { url, key, instance } = getCfg();
  if (!url || !key || !instance) return { ok: false, status: 500, error: "Evolution API não configurada" };
  try {
    const res = await fetch(`${url}/message/sendMedia/${encodeURIComponent(instance)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: key },
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
  const { url, key, instance } = getCfg();
  if (!url || !key || !instance) return { ok: false, status: 500, error: "Evolution API não configurada" };
  try {
    const res = await fetch(`${url}/message/sendWhatsAppAudio/${encodeURIComponent(instance)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: key },
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

export async function evoConnectionState(): Promise<{ ok: boolean; connected: boolean; state: string; raw?: any }> {
  const { url, key, instance } = getCfg();
  if (!url || !key || !instance) return { ok: false, connected: false, state: "not_configured" };
  try {
    const res = await fetch(`${url}/instance/connectionState/${encodeURIComponent(instance)}`, {
      headers: { apikey: key },
    });
    if (!res.ok) return { ok: false, connected: false, state: `http_${res.status}` };
    const data = await res.json();
    const state = data?.instance?.state || data?.state || "unknown";
    return { ok: true, connected: state === "open", state, raw: data };
  } catch (e) {
    return { ok: false, connected: false, state: "error" };
  }
}

export async function evoConnect(): Promise<{ ok: boolean; status: number; qrcode?: string | null; state?: string; raw?: any }> {
  const { url, key, instance } = getCfg();
  if (!url || !key || !instance) return { ok: false, status: 500 };
  try {
    const res = await fetch(`${url}/instance/connect/${encodeURIComponent(instance)}`, {
      headers: { apikey: key },
    });
    const raw = await res.text();
    let data: any = {};
    try { data = raw ? JSON.parse(raw) : {}; } catch { data = { raw }; }
    let qr: string | null = data?.base64 || data?.qrcode || data?.qr || null;
    if (qr && !qr.startsWith("data:")) qr = `data:image/png;base64,${qr}`;
    return { ok: res.ok, status: res.status, qrcode: qr, state: data?.instance?.state, raw: data };
  } catch (e) {
    return { ok: false, status: 500, raw: { error: e instanceof Error ? e.message : String(e) } };
  }
}

export async function evoDownloadMediaBase64(messagePayload: any): Promise<string | null> {
  const { url, key, instance } = getCfg();
  if (!url || !key || !instance) return null;
  try {
    const res = await fetch(`${url}/chat/getBase64FromMediaMessage/${encodeURIComponent(instance)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: key },
      body: JSON.stringify({ message: messagePayload, convertToMp4: false }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.base64 || data?.data || null;
  } catch {
    return null;
  }
}

/** Valida header `apikey` enviado pelo Evolution webhook contra EVOLUTION_API_KEY. */
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

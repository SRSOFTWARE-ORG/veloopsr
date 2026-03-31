import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { PDFDocument, rgb, StandardFonts } from "npm:pdf-lib@1.17.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function fmt(v: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}
function fmtDate(d: string): string {
  return d.split("-").reverse().join("/");
}
function maskCpf(cpf: string): string {
  const digits = cpf.replace(/\D/g, "");
  if (digits.length === 11) return `${digits.slice(0,3)}.***.***-${digits.slice(9)}`;
  return cpf;
}
function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/✓/g, "OK").replace(/—/g, "-").replace(/[^\x00-\x7F]/g, "");
}
function placeholder(val: string | null | undefined, fallback = "* * *"): string {
  return val && val.trim() ? val.trim() : fallback;
}

async function sendWhatsAppPdf(phone: string, pdfUrl: string, caption: string): Promise<boolean> {
  const UAZAPI_URL = Deno.env.get("UAZAPI_URL");
  const UAZAPI_TOKEN = Deno.env.get("UAZAPI_TOKEN");
  if (!UAZAPI_URL || !UAZAPI_TOKEN) return false;
  let cleanPhone = phone.replace(/\D/g, "");
  if (cleanPhone.startsWith("0")) cleanPhone = cleanPhone.slice(1);
  if (!cleanPhone.startsWith("55")) cleanPhone = "55" + cleanPhone;
  try {
    const apiUrl = UAZAPI_URL.replace(/\/+$/, "");
    // UAZAPI V2 Go doesn't support /send/document — send as text with link
    const textMsg = `${caption}\n\n🔗 Baixe o comprovante PDF:\n${pdfUrl}`;
    const res = await fetch(`${apiUrl}/send/text`, {
      method: "POST",
      headers: { "Content-Type": "application/json", token: UAZAPI_TOKEN },
      body: JSON.stringify({ number: cleanPhone, text: textMsg, linkPreview: true }),
    });
    return res.ok;
  } catch (err) {
    console.error("[UAZAPI] PDF send error:", err);
    return false;
  }
}

async function fetchLogoBytes(): Promise<Uint8Array | null> {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const logoUrl = `${supabaseUrl}/storage/v1/object/public/documentos_vendas/assets/nota_sr.jpg`;
    const res = await fetch(logoUrl);
    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  } catch {
    return null;
  }
}

interface ReceiptData {
  clienteNome: string;
  clienteCpf: string;
  clienteTelefone: string;
  clienteEndereco: string;
  clienteCidade: string;
  clienteUf: string;
  valorParcela: number;
  dataVencimento: string;
  parcelaNum: number;
  totalParcelas: number;
  cobrancaObs: string | null;
  descricao: string;
}

async function generatePdf(data: ReceiptData, preloadedLogo: Uint8Array | null = null): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const { width, height } = page.getSize();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const regular = await doc.embedFont(StandardFonts.Helvetica);

  const green = rgb(0.08, 0.45, 0.27);
  const darkGreen = rgb(0.05, 0.35, 0.2);
  const black = rgb(0.1, 0.1, 0.1);
  const gray = rgb(0.4, 0.4, 0.4);
  const lightGray = rgb(0.85, 0.85, 0.85);
  const white = rgb(1, 1, 1);

  // Safe drawText wrapper — strips accents to avoid WinAnsi encoding errors
  const safeText = (text: string, opts: any) => {
    page.drawText(stripAccents(text), opts);
  };

  // ── Logo watermark (center, 90% transparent) ──
  const logoBytes = preloadedLogo ?? await fetchLogoBytes();
  if (logoBytes) {
    try {
      const logoImg = await doc.embedJpg(logoBytes);
      const logoDim = logoImg.scale(0.45);
      page.drawImage(logoImg, {
        x: width / 2 - logoDim.width / 2,
        y: height / 2 - logoDim.height / 2,
        width: logoDim.width,
        height: logoDim.height,
        opacity: 0.07,
      });
    } catch (e) {
      console.error("Logo embed error:", e);
    }
  }

  // ── Header ──
  page.drawRectangle({ x: 0, y: height - 110, width, height: 110, color: green });
  safeText("SR SOFTWARE", { x: 40, y: height - 42, size: 26, font: bold, color: white });
  safeText("CNPJ: * * . * * * . * * * / * * * * - * *", { x: 40, y: height - 62, size: 9, font: regular, color: rgb(0.8, 0.95, 0.88) });
  safeText("Veloop — Sistema de Gestao Inteligente", { x: 40, y: height - 78, size: 10, font: regular, color: rgb(0.8, 0.95, 0.88) });
  safeText("veloopsr.lovable.app", { x: 40, y: height - 94, size: 9, font: regular, color: rgb(0.7, 0.9, 0.8) });

  // Nota number on right
  const notaNum = `#${String(Date.now()).slice(-8)}`;
  const notaW = bold.widthOfTextAtSize(notaNum, 14);
  safeText("NOTA DE PAGAMENTO", { x: width - 40 - bold.widthOfTextAtSize("NOTA DE PAGAMENTO", 12), y: height - 42, size: 12, font: bold, color: white });
  safeText(notaNum, { x: width - 40 - notaW, y: height - 60, size: 14, font: bold, color: rgb(0.9, 1, 0.95) });
  safeText(fmtDate(new Date().toISOString().slice(0, 10)), { x: width - 40 - regular.widthOfTextAtSize(fmtDate(new Date().toISOString().slice(0, 10)), 10), y: height - 78, size: 10, font: regular, color: rgb(0.8, 0.95, 0.88) });

  let y = height - 140;

  // ── Section: DADOS DO CLIENTE ──
  page.drawRectangle({ x: 30, y: y - 5, width: width - 60, height: 22, color: darkGreen });
  safeText("DADOS DO CLIENTE", { x: 40, y: y, size: 11, font: bold, color: white });
  y -= 30;

  const lineH = 20;
  const col1 = 40;
  const col2 = 155;
  const col3 = 320;
  const col4 = 410;

  const drawRow = (l1: string, v1: string, l2?: string, v2?: string) => {
    safeText(l1, { x: col1, y, size: 9, font: bold, color: gray });
    safeText(v1, { x: col2, y, size: 9, font: regular, color: black });
    if (l2 && v2) {
      safeText(l2, { x: col3, y, size: 9, font: bold, color: gray });
      safeText(v2, { x: col4, y, size: 9, font: regular, color: black });
    }
    y -= lineH;
  };

  drawRow("Cliente:", placeholder(data.clienteNome), "CPF:", data.clienteCpf ? maskCpf(data.clienteCpf) : "* * * . * * * . * * * - * *");
  drawRow("Telefone:", placeholder(data.clienteTelefone, "(* *) * * * * *-* * * *"), "UF:", placeholder(data.clienteUf, "* *"));
  drawRow("Endereco:", placeholder(data.clienteEndereco, "* * * * * * * * * * * * * * * * * *"), "Cidade:", placeholder(data.clienteCidade, "* * * * * * * *"));

  y -= 10;

  // ── Section: DETALHES DO PAGAMENTO ──
  page.drawRectangle({ x: 30, y: y - 5, width: width - 60, height: 22, color: darkGreen });
  safeText("DETALHES DO PAGAMENTO", { x: 40, y: y, size: 11, font: bold, color: white });
  y -= 30;

  // Table header
  page.drawRectangle({ x: 30, y: y - 3, width: width - 60, height: 18, color: lightGray });
  safeText("Descricao", { x: 40, y, size: 9, font: bold, color: black });
  safeText("Parcela", { x: 280, y, size: 9, font: bold, color: black });
  safeText("Vencimento", { x: 370, y, size: 9, font: bold, color: black });
  safeText("Valor", { x: 480, y, size: 9, font: bold, color: black });
  y -= 22;

  // Table row
  const descTxt = data.descricao || data.cobrancaObs || "Parcela de Servico";
  safeText(descTxt.slice(0, 35), { x: 40, y, size: 9, font: regular, color: black });
  safeText(`${data.parcelaNum}/${data.totalParcelas}`, { x: 290, y, size: 9, font: regular, color: black });
  safeText(fmtDate(data.dataVencimento), { x: 370, y, size: 9, font: regular, color: black });
  safeText(fmt(data.valorParcela), { x: 470, y, size: 9, font: regular, color: black });
  y -= 5;

  // Table bottom line
  page.drawRectangle({ x: 30, y, width: width - 60, height: 1, color: lightGray });
  y -= 25;

  // Total box
  page.drawRectangle({ x: 370, y: y - 5, width: width - 400, height: 28, color: green });
  safeText("TOTAL PAGO:", { x: 380, y, size: 11, font: bold, color: white });
  const totalTxt = fmt(data.valorParcela);
  safeText(totalTxt, { x: width - 40 - bold.widthOfTextAtSize(totalTxt, 13), y: y - 1, size: 13, font: bold, color: white });
  y -= 45;

  // ── Section: INFORMACOES DE PAGAMENTO ──
  page.drawRectangle({ x: 30, y: y - 5, width: width - 60, height: 22, color: darkGreen });
  safeText("INFORMACOES DE PAGAMENTO", { x: 40, y: y, size: 11, font: bold, color: white });
  y -= 30;

  drawRow("Status:", "PAGO ✓", "Forma:", "PIX");
  drawRow("Data do Pagamento:", fmtDate(new Date().toISOString().slice(0, 10)), "Hora:", new Date().toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }));

  if (data.cobrancaObs) {
    y -= 5;
    drawRow("Obs:", data.cobrancaObs.slice(0, 60));
  }

  y -= 20;
  // Divider
  page.drawRectangle({ x: 30, y, width: width - 60, height: 1, color: lightGray });
  y -= 25;

  // Legal text
  safeText("Este documento comprova o recebimento do pagamento referente ao servico/produto descrito acima.", { x: 40, y, size: 8, font: regular, color: gray });
  y -= 14;
  safeText("Nota gerada automaticamente pelo sistema Veloop — SR Software. Documento valido sem assinatura.", { x: 40, y, size: 8, font: regular, color: gray });
  y -= 14;
  safeText("Em caso de duvidas, entre em contato pelo WhatsApp: (27) 99917-7265", { x: 40, y, size: 8, font: regular, color: gray });

  // ── Footer ──
  page.drawRectangle({ x: 0, y: 0, width, height: 45, color: green });
  safeText("SR Software — Veloop", { x: 40, y: 22, size: 10, font: bold, color: white });
  safeText("veloopsr.lovable.app  |  WhatsApp: (27) 99917-7265", { x: 40, y: 8, size: 8, font: regular, color: rgb(0.8, 0.95, 0.88) });
  safeText("Documento eletronico", { x: width - 40 - regular.widthOfTextAtSize("Documento eletronico", 8), y: 8, size: 8, font: regular, color: rgb(0.8, 0.95, 0.88) });

  return await doc.save();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { cobranca_id, data_vencimento } = await req.json();
    if (!cobranca_id || !data_vencimento) {
      return new Response(JSON.stringify({ error: "cobranca_id and data_vencimento required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Run DB queries and logo fetch in parallel for speed
    const [cobResult, logoBytes] = await Promise.all([
      supabase.from("cobrancas").select("*").eq("id", cobranca_id).single(),
      fetchLogoBytes(),
    ]);
    const { data: cob, error: cobErr } = cobResult;
    if (cobErr || !cob) throw new Error("Cobranca nao encontrada");

    const { data: cliente } = await supabase.from("clientes").select("nome, cpf, telefone, endereco, cidade, uf").eq("id", cob.cliente_id).single();

    const clienteNome = cliente?.nome || cob.cliente_nome;
    const clienteCpf = cliente?.cpf || "";
    const clienteTelefone = cliente?.telefone || "";

    // Calculate parcela number
    const start = new Date(`${cob.data_inicio}T00:00:00Z`);
    const end = new Date(`${cob.data_fim}T00:00:00Z`);
    const dates: string[] = [];
    let current = new Date(start);
    while (current <= end) {
      dates.push(current.toISOString().slice(0, 10));
      if (cob.frequencia === "semana") current = new Date(current.getTime() + 7 * 86400000);
      else if (cob.frequencia === "quinzena") current = new Date(current.getTime() + 15 * 86400000);
      else {
        const day = current.getUTCDate();
        current.setUTCDate(1);
        current.setUTCMonth(current.getUTCMonth() + 1);
        const lastDay = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() + 1, 0)).getUTCDate();
        current.setUTCDate(Math.min(day, lastDay));
      }
    }

    const parcelaNum = dates.indexOf(data_vencimento) + 1 || 1;
    const totalParcelas = dates.length;

    const pdfBytes = await generatePdf({
      clienteNome,
      clienteCpf,
      clienteTelefone,
      clienteEndereco: cliente?.endereco || "",
      clienteCidade: cliente?.cidade || "",
      clienteUf: cliente?.uf || "",
      valorParcela: cob.valor_parcela,
      dataVencimento: data_vencimento,
      parcelaNum,
      totalParcelas,
      cobrancaObs: cob.observacoes,
      descricao: cob.observacoes || "Parcela de Servico",
    }, logoBytes);

    const fileName = `comprovantes/${cobranca_id}_${data_vencimento}.pdf`;
    const { error: uploadErr } = await supabase.storage.from("documentos_vendas").upload(fileName, pdfBytes, { contentType: "application/pdf", upsert: true });
    if (uploadErr) throw new Error("Falha ao salvar PDF");

    const { data: urlData } = supabase.storage.from("documentos_vendas").getPublicUrl(fileName);
    const pdfUrl = urlData.publicUrl;

    let whatsappSent = false;
    if (clienteTelefone) {
      const caption = `📄 *Nota de Pagamento — SR Software*\n\n👤 ${clienteNome}\n📅 Parcela ${parcelaNum}/${totalParcelas}\n💰 ${fmt(cob.valor_parcela)}\n\n_Veloop — SR Software_ 🟢`;
      whatsappSent = await sendWhatsAppPdf(clienteTelefone, pdfUrl, caption);
    }

    return new Response(JSON.stringify({ success: true, pdf_url: pdfUrl, whatsapp_sent: whatsappSent }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

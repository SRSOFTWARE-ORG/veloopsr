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

import { evoSendMedia, evoSendText } from "../_shared/evolution.ts";
async function sendWhatsAppPdf(phone: string, pdfUrl: string, caption: string, docName: string): Promise<boolean> {
  try {
    const r = await evoSendMedia({
      phone,
      mediatype: "document",
      media: pdfUrl,
      fileName: docName,
      caption,
      mimetype: "application/pdf",
    });
    if (r.ok) return true;
    console.warn("[Evolution] sendMedia falhou, fallback texto:", r.status, r.error);
    const textMsg = `${caption}\n\n🔗 Baixe o comprovante PDF:\n${pdfUrl}`;
    const r2 = await evoSendText(phone, textMsg);
    return r2.ok;
  } catch (err) {
    console.error("[Evolution] PDF send error:", err);
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
  // Pagamento parcial / sub-parcela
  valorPagoAto?: number;
  valorOriginalParcela?: number;
  jurosAplicado?: number;
  saldoRestante?: number;
  destinoSaldo?: string | null;
  subParcelaNovaData?: string | null;
  detalhamento?: string[];
  tituloDocumento?: string;
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

  // Table row
  const descTxt = data.descricao || data.cobrancaObs || "Parcela de Servico";
  safeText(descTxt.slice(0, 35), { x: 40, y, size: 9, font: regular, color: black });
  safeText(`${data.parcelaNum}/${data.totalParcelas}`, { x: 290, y, size: 9, font: regular, color: black });
  safeText(fmtDate(data.dataVencimento), { x: 370, y, size: 9, font: regular, color: black });
  const valorAto = data.valorPagoAto ?? data.valorParcela;
  safeText(fmt(valorAto), { x: 470, y, size: 9, font: regular, color: black });
  y -= 5;

  // Table bottom line
  page.drawRectangle({ x: 30, y, width: width - 60, height: 1, color: lightGray });
  y -= 25;

  // Total box — sempre exibe somente o valor pago no ato
  page.drawRectangle({ x: 370, y: y - 5, width: width - 400, height: 28, color: green });
  safeText("TOTAL PAGO:", { x: 380, y, size: 11, font: bold, color: white });
  const totalTxt = fmt(valorAto);
  safeText(totalTxt, { x: width - 40 - bold.widthOfTextAtSize(totalTxt, 13), y: y - 1, size: 13, font: bold, color: white });
  y -= 45;

  // ── Detalhamento (juros, saldo, sub-parcela) ──
  const detalhes: string[] = [];
  if (data.valorOriginalParcela != null) {
    detalhes.push(`Valor original da parcela: ${fmt(data.valorOriginalParcela)}`);
  }
  if ((data.jurosAplicado ?? 0) > 0) {
    detalhes.push(`Juros por atraso aplicados: ${fmt(data.jurosAplicado!)}`);
  }
  if (data.valorPagoAto != null && data.valorOriginalParcela != null) {
    detalhes.push(`Valor pago neste ato: ${fmt(data.valorPagoAto)}`);
  }
  if ((data.saldoRestante ?? 0) > 0) {
    const venc = data.subParcelaNovaData ? fmtDate(data.subParcelaNovaData) : "data a definir";
    if (data.destinoSaldo === "proxima_parcela") {
      detalhes.push(`Saldo restante: ${fmt(data.saldoRestante!)} — sera somado a proxima fatura (${venc}).`);
    } else if (data.destinoSaldo === "sub_parcela") {
      detalhes.push(`Saldo restante: ${fmt(data.saldoRestante!)} — cobranca avulsa agendada para ${venc}.`);
    } else {
      detalhes.push(`Saldo restante: ${fmt(data.saldoRestante!)}`);
    }
  }
  for (const linhaExtra of data.detalhamento || []) detalhes.push(linhaExtra);

  if (detalhes.length > 0) {
    page.drawRectangle({ x: 30, y: y - 5, width: width - 60, height: 22, color: darkGreen });
    safeText("DETALHAMENTO DA COBRANCA", { x: 40, y: y, size: 11, font: bold, color: white });
    y -= 24;
    for (const linha of detalhes) {
      safeText(`- ${linha}`.slice(0, 110), { x: 40, y, size: 9, font: regular, color: black });
      y -= 14;
    }
    y -= 8;
  }

  // ── Section: INFORMACOES DE PAGAMENTO ──
  page.drawRectangle({ x: 30, y: y - 5, width: width - 60, height: 22, color: darkGreen });
  safeText("INFORMACOES DE PAGAMENTO", { x: 40, y: y, size: 11, font: bold, color: white });
  y -= 30;

  const statusLabel = (data.saldoRestante ?? 0) > 0 ? "PAGAMENTO PARCIAL" : "PAGO OK";
  drawRow("Status:", statusLabel, "Forma:", "PIX");
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
  safeText("Este documento comprova o recebimento do pagamento descrito acima.", { x: 40, y, size: 8, font: regular, color: gray });
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

  // Auth: allow service role (internal webhooks) OR authenticated users
  const _authToken = req.headers.get("Authorization")?.replace("Bearer ", "") ?? "";
  const _serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  if (_authToken !== _serviceKey) {
    const _r = await fetch(`${Deno.env.get("SUPABASE_URL")}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${_authToken}`, apikey: Deno.env.get("SUPABASE_ANON_KEY")! },
    });
    if (!_r.ok) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const bodyJson = await req.json();
    const {
      cobranca_id,
      data_vencimento,
      pagamento_id,
      sub_parcela_id,
      parcial,
      valor_pago,
      juros_aplicado,
      valor_original,
      saldo_restante,
      destino_saldo,
      sub_parcela_nova_data,
    } = bodyJson;
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

    // Detalhamento extra para sub-parcela ou saldo arrastado
    const detalhamento: string[] = [];
    let descricaoFinal = cob.observacoes || "Parcela de Servico";

    if (sub_parcela_id) {
      const { data: sp } = await supabase.from("cobranca_sub_parcelas").select("*").eq("id", sub_parcela_id).single();
      if (sp) {
        descricaoFinal = sp.descricao;
        detalhamento.push(`Cobranca avulsa: ${sp.descricao}`);
        if (sp.parent_data_vencimento) {
          detalhamento.push(`Referente a parcela de ${sp.parent_data_vencimento.split("-").reverse().join("/")}`);
        }
      }
    } else {
      // Verifica se ha sub-parcela vinculada a esta data (saldo arrastado da fatura anterior)
      const { data: arrastadas } = await supabase
        .from("cobranca_sub_parcelas")
        .select("descricao, valor, parent_data_vencimento")
        .eq("cobranca_id", cobranca_id)
        .eq("data_vencimento", data_vencimento)
        .in("status", ["a_pagar", "pago"]);
      for (const arr of arrastadas || []) {
        const ref = arr.parent_data_vencimento ? arr.parent_data_vencimento.split("-").reverse().join("/") : "";
        detalhamento.push(`Inclui saldo restante da parcela ${ref}: ${fmt(Number(arr.valor))}`);
      }
    }

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
      descricao: descricaoFinal,
      valorPagoAto: valor_pago != null ? Number(valor_pago) : undefined,
      valorOriginalParcela: valor_original != null ? Number(valor_original) : undefined,
      jurosAplicado: juros_aplicado != null ? Number(juros_aplicado) : undefined,
      saldoRestante: saldo_restante != null ? Number(saldo_restante) : undefined,
      destinoSaldo: destino_saldo ?? null,
      subParcelaNovaData: sub_parcela_nova_data ?? null,
      detalhamento,
    }, logoBytes);

    const suffix = sub_parcela_id ? `_sub_${sub_parcela_id}` : (pagamento_id ? `_pag_${pagamento_id}` : "");
    const fileName = `comprovantes/${cobranca_id}_${data_vencimento}${suffix}.pdf`;
    const { error: uploadErr } = await supabase.storage.from("documentos_vendas").upload(fileName, pdfBytes, { contentType: "application/pdf", upsert: true });
    if (uploadErr) throw new Error("Falha ao salvar PDF");

    const { data: urlData } = supabase.storage.from("documentos_vendas").getPublicUrl(fileName);
    const pdfUrl = urlData.publicUrl;

    const valorExibido = valor_pago != null ? Number(valor_pago) : cob.valor_parcela;
    let whatsappSent = false;
    if (clienteTelefone) {
      const tituloMsg = (saldo_restante ?? 0) > 0 ? "Comprovante de Pagamento Parcial" : "Nota de Pagamento";
      let caption = `📄 *${tituloMsg} — SR Software*\n\n👤 ${clienteNome}\n📅 Parcela ${parcelaNum}/${totalParcelas}\n💰 ${fmt(valorExibido)}`;
      if ((saldo_restante ?? 0) > 0 && sub_parcela_nova_data) {
        caption += `\n💡 Saldo restante de ${fmt(Number(saldo_restante))} sera cobrado em ${sub_parcela_nova_data.split("-").reverse().join("/")}`;
      }
      caption += `\n\n_Veloop — SR Software_ 🟢`;
      const docName = `Comprovante_${clienteNome.replace(/\s+/g, "_")}_${data_vencimento}.pdf`;
      whatsappSent = await sendWhatsAppPdf(clienteTelefone, pdfUrl, caption, docName);
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

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { PDFDocument, rgb, StandardFonts } from "npm:pdf-lib@1.17.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function formatCurrency(v: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

function formatDate(d: string): string {
  return d.split("-").reverse().join("/");
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
    const res = await fetch(`${apiUrl}/send/document`, {
      method: "POST",
      headers: { "Content-Type": "application/json", token: UAZAPI_TOKEN },
      body: JSON.stringify({
        number: cleanPhone,
        url: pdfUrl,
        fileName: "Comprovante_Pagamento.pdf",
        caption,
      }),
    });
    return res.ok;
  } catch (err) {
    console.error("[UAZAPI] PDF send error:", err);
    return false;
  }
}

async function generatePdf(
  clienteNome: string,
  clienteCpf: string,
  valorParcela: number,
  dataVencimento: string,
  parcelaNum: number,
  totalParcelas: number,
  cobrancaObs: string | null,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]); // A4
  const { width, height } = page.getSize();

  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const fontRegular = await doc.embedFont(StandardFonts.Helvetica);

  // Watermark
  const watermarkText = "SR SOFTWARE";
  const wmSize = 60;
  page.drawText(watermarkText, {
    x: width / 2 - fontBold.widthOfTextAtSize(watermarkText, wmSize) / 2,
    y: height / 2 - 30,
    size: wmSize,
    font: fontBold,
    color: rgb(0.9, 0.9, 0.9),
    opacity: 0.15,
  });

  // Header bar
  page.drawRectangle({ x: 0, y: height - 100, width, height: 100, color: rgb(0.1, 0.48, 0.3) });
  page.drawText("SR SOFTWARE", { x: 40, y: height - 45, size: 24, font: fontBold, color: rgb(1, 1, 1) });
  page.drawText("Veloop - Sistema de Gestao", { x: 40, y: height - 70, size: 12, font: fontRegular, color: rgb(0.85, 0.95, 0.9) });

  // Title
  const titleY = height - 140;
  page.drawText("COMPROVANTE DE PAGAMENTO", { x: 40, y: titleY, size: 18, font: fontBold, color: rgb(0.1, 0.48, 0.3) });

  // Divider
  page.drawRectangle({ x: 40, y: titleY - 15, width: width - 80, height: 2, color: rgb(0.1, 0.48, 0.3) });

  // Info block
  let y = titleY - 50;
  const lineH = 28;

  const drawField = (label: string, value: string) => {
    page.drawText(label, { x: 40, y, size: 11, font: fontBold, color: rgb(0.3, 0.3, 0.3) });
    page.drawText(value, { x: 200, y, size: 11, font: fontRegular, color: rgb(0.1, 0.1, 0.1) });
    y -= lineH;
  };

  drawField("Cliente:", clienteNome);
  if (clienteCpf) {
    const masked = clienteCpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.***.***-$4");
    drawField("CPF:", masked);
  }
  drawField("Parcela:", `${parcelaNum} de ${totalParcelas}`);
  drawField("Vencimento:", formatDate(dataVencimento));
  drawField("Valor Pago:", formatCurrency(valorParcela));
  drawField("Data Pagamento:", formatDate(new Date().toISOString().slice(0, 10)));
  drawField("Status:", "PAGO");

  if (cobrancaObs) {
    y -= 10;
    drawField("Observacoes:", cobrancaObs.slice(0, 80));
  }

  // Divider
  y -= 10;
  page.drawRectangle({ x: 40, y, width: width - 80, height: 1, color: rgb(0.8, 0.8, 0.8) });
  y -= 30;

  page.drawText("Este comprovante confirma o recebimento do pagamento.", {
    x: 40, y, size: 10, font: fontRegular, color: rgb(0.4, 0.4, 0.4),
  });
  y -= 18;
  page.drawText("Documento gerado automaticamente pelo sistema Veloop - SR Software.", {
    x: 40, y, size: 9, font: fontRegular, color: rgb(0.5, 0.5, 0.5),
  });

  // Footer bar
  page.drawRectangle({ x: 0, y: 0, width, height: 40, color: rgb(0.1, 0.48, 0.3) });
  page.drawText("SR Software - Veloop | veloopsr.lovable.app", {
    x: 40, y: 14, size: 9, font: fontRegular, color: rgb(1, 1, 1),
  });

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

    // Fetch cobranca
    const { data: cob, error: cobErr } = await supabase
      .from("cobrancas")
      .select("*")
      .eq("id", cobranca_id)
      .single();
    if (cobErr || !cob) throw new Error("Cobrança não encontrada");

    // Fetch client
    const { data: cliente } = await supabase
      .from("clientes")
      .select("nome, cpf, telefone")
      .eq("id", cob.cliente_id)
      .single();

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

    // Generate PDF
    const pdfBytes = await generatePdf(
      clienteNome, clienteCpf, cob.valor_parcela,
      data_vencimento, parcelaNum, totalParcelas, cob.observacoes,
    );

    // Upload to storage
    const fileName = `comprovantes/${cobranca_id}_${data_vencimento}.pdf`;
    const { error: uploadErr } = await supabase.storage
      .from("documentos_vendas")
      .upload(fileName, pdfBytes, {
        contentType: "application/pdf",
        upsert: true,
      });

    if (uploadErr) {
      console.error("Upload error:", uploadErr);
      throw new Error("Falha ao salvar PDF");
    }

    const { data: urlData } = supabase.storage.from("documentos_vendas").getPublicUrl(fileName);
    const pdfUrl = urlData.publicUrl;

    // Send via WhatsApp
    let whatsappSent = false;
    if (clienteTelefone) {
      const caption = `✅ *Comprovante de Pagamento*\n\n👤 ${clienteNome}\n📅 Parcela ${parcelaNum}/${totalParcelas}\n💰 ${formatCurrency(cob.valor_parcela)}\n\n_SR Software - Veloop_ 🟢`;
      whatsappSent = await sendWhatsAppPdf(clienteTelefone, pdfUrl, caption);
    }

    return new Response(JSON.stringify({
      success: true,
      pdf_url: pdfUrl,
      whatsapp_sent: whatsappSent,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

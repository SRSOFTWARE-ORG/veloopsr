import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-n8n-token",
};

// ─── Helpers ───

function formatCurrency(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(d: string) {
  const [y, m, dd] = d.split("-");
  return `${dd}/${m}/${y}`;
}

function isAuthorizedRequest(req: Request) {
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authHeader = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  const apiKeyHeader = req.headers.get("apikey")?.trim();
  const serviceRoleMatches = !!serviceRoleKey && (authHeader === serviceRoleKey || apiKeyHeader === serviceRoleKey);

  return serviceRoleMatches;
}

interface WhatsAppSendResult {
  ok: boolean;
  status: number;
  error?: string;
}

function normalizePhone(phone: string) {
  const digits = phone.replace(/\D/g, "").replace(/^0+/, "");
  return digits.startsWith("55") ? digits : `55${digits}`;
}

function digitsOnly(value?: string | null) {
  return (value || "").replace(/\D/g, "");
}

function randomDelay(min: number, max: number) {
  const ms = Math.floor(Math.random() * (max - min + 1) + min) * 1000;
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendWhatsApp(phone: string, message: string): Promise<WhatsAppSendResult> {
  const url = Deno.env.get("UAZAPI_URL");
  const token = Deno.env.get("UAZAPI_TOKEN");
  if (!url || !token) {
    return { ok: false, status: 500, error: "UAZAPI_URL ou UAZAPI_TOKEN não configurados" };
  }

  try {
    const res = await fetch(`${url.replace(/\/+$/, "")}/send/text`, {
      method: "POST",
      headers: { "Content-Type": "application/json", token },
      body: JSON.stringify({ number: normalizePhone(phone), text: message, linkPreview: false }),
    });

    const rawBody = await res.text();
    let parsedBody: any = null;
    try {
      parsedBody = rawBody ? JSON.parse(rawBody) : null;
    } catch {
      parsedBody = rawBody;
    }

    const statusValue = parsedBody?.status;
    const hasExplicitError =
      parsedBody?.error &&
      parsedBody?.error !== false &&
      parsedBody?.error !== "false";

    const errorMessage = !res.ok
      ? parsedBody?.error || parsedBody?.message || rawBody || `HTTP ${res.status}`
      : hasExplicitError
      ? String(parsedBody.error)
      : statusValue === false || statusValue === "error" || statusValue === "ERROR"
      ? parsedBody?.message || rawBody || "Erro ao enviar WhatsApp"
      : undefined;

    if (!res.ok || errorMessage) {
      console.error("[financial-agent] sendWhatsApp failed:", {
        status: res.status,
        error: errorMessage,
        body: parsedBody,
      });

      return {
        ok: false,
        status: res.status,
        error: errorMessage,
      };
    }

    return { ok: true, status: res.status };
  } catch (e) {
    console.error("[financial-agent] sendWhatsApp error:", e);
    return {
      ok: false,
      status: 500,
      error: e instanceof Error ? e.message : "Erro desconhecido ao enviar WhatsApp",
    };
  }
}

async function notifyN8nHandover(status: string, phone: string, context: Record<string, unknown>) {
  void status;
  void phone;
  void context;
  return;
}

// ─── Financial Intent Keywords ───

const FINANCIAL_KEYWORDS = [
  "pagamento", "parcela", "boleto", "pix", "fatura", "devo", "vence",
  "cobrança", "cobrar", "débito", "atraso", "renegociar", "comprovante",
  "cartão", "crédito", "quanto eu devo", "quando vence", "ver minha fatura",
  "pagar", "quitar", "quitação", "valor", "conta",
];

const DATA_KEYWORDS = [
  "cpf", "cnpj", "endereço", "endereco", "contrato", "alterar cadastro",
  "mudar dados", "atualizar dados",
];

function detectIntent(message: string): "financial" | "data" | "general" {
  const lower = message.toLowerCase();
  if (FINANCIAL_KEYWORDS.some((kw) => lower.includes(kw))) return "financial";
  if (DATA_KEYWORDS.some((kw) => lower.includes(kw))) return "data";
  return "general";
}

// ─── CPF Lookup ───

async function lookupClienteByCpf(supabase: any, rawCpf: string) {
  const digits = rawCpf.replace(/\D/g, "");
  if (digits.length !== 11 && digits.length !== 14) return null;

  // Validate CPF check digits
  if (digits.length === 11) {
    if (/^(\d)\1{10}$/.test(digits)) return null;
    let sum = 0;
    for (let i = 0; i < 9; i++) sum += parseInt(digits[i]) * (10 - i);
    let check = 11 - (sum % 11);
    if (check >= 10) check = 0;
    if (parseInt(digits[9]) !== check) return null;
    sum = 0;
    for (let i = 0; i < 10; i++) sum += parseInt(digits[i]) * (11 - i);
    check = 11 - (sum % 11);
    if (check >= 10) check = 0;
    if (parseInt(digits[10]) !== check) return null;
  }

  const { data: c1 } = await supabase.from("clientes").select("id, nome, cpf, telefone, email")
    .eq("cpf", rawCpf.trim()).maybeSingle();
  if (c1) return c1;

  if (digits.length === 11) {
    const formatted = `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
    const { data: c2 } = await supabase.from("clientes").select("id, nome, cpf, telefone, email")
      .eq("cpf", formatted).maybeSingle();
    if (c2) return c2;
  }

  const { data: c3 } = await supabase.from("clientes").select("id, nome, cpf, telefone, email")
    .eq("cpf", digits).maybeSingle();
  if (c3) return c3;

  const { data: c4 } = await supabase.from("clientes").select("id, nome, cpf, telefone, email")
    .ilike("cpf", `%${digits}%`).limit(1).maybeSingle();
  return c4 || null;
}

// ─── Lookup by Phone ───

async function lookupClienteByPhone(supabase: any, phone: string) {
  const digits = digitsOnly(phone);
  const localDigits = digits.startsWith("55") && digits.length > 11 ? digits.slice(-11) : digits;
  const local10 = localDigits.slice(-10);
  const local11 = localDigits.slice(-11);

  const exactCandidates = [
    phone.trim(),
    digits,
    localDigits,
    local10,
    local11,
    local11.length === 11 ? `(${local11.slice(0, 2)}) ${local11.slice(2, 7)}-${local11.slice(7)}` : null,
    local10.length === 10 ? `(${local10.slice(0, 2)}) ${local10.slice(2, 6)}-${local10.slice(6)}` : null,
  ].filter(Boolean) as string[];

  for (const candidate of exactCandidates) {
    const { data } = await supabase
      .from("clientes")
      .select("id, nome, cpf, telefone, email")
      .eq("telefone", candidate)
      .maybeSingle();

    if (data) return data;
  }

  const suffixes = [...new Set([
    local11.slice(-9),
    local11.slice(-8),
    local10.slice(-8),
    local10.slice(-4),
  ].filter((value) => value && value.length >= 4))];

  for (const suffix of suffixes) {
    const { data } = await supabase
      .from("clientes")
      .select("id, nome, cpf, telefone, email")
      .ilike("telefone", `%${suffix}%`)
      .limit(25);

    const match = (data || []).find((cliente: any) => {
      const clientDigits = digitsOnly(cliente.telefone);
      return (
        clientDigits === digits ||
        clientDigits === localDigits ||
        clientDigits.endsWith(local11) ||
        clientDigits.endsWith(local10)
      );
    });

    if (match) return match;
  }

  return null;
}

// ─── Fetch Financial Summary ───

async function fetchFinancialSummary(supabase: any, clienteId: string) {
  const { data: cobrancas } = await supabase.from("cobrancas")
    .select("id, valor_parcela, cliente_nome, data_inicio, data_fim, frequencia")
    .eq("cliente_id", clienteId);

  if (!cobrancas?.length) {
    return { summary: "Não encontrei cobranças ativas no seu cadastro.", parcelas: [], totalPendente: 0 };
  }

  const cobrancaIds = cobrancas.map((c: any) => c.id);

  const { data: parcelas } = await supabase.from("cobranca_pagamentos")
    .select("id, cobranca_id, data_vencimento, status, pago_em, tipo_pagamento")
    .in("cobranca_id", cobrancaIds)
    .order("data_vencimento", { ascending: true });

  const pendentes = (parcelas || []).filter((p: any) => p.status === "a_pagar" || p.status === "pendente");
  const pagas = (parcelas || []).filter((p: any) => p.status === "pago");
  const atrasadas = pendentes.filter((p: any) => p.status === "pendente");

  const cobMap = new Map(cobrancas.map((c: any) => [c.id, c]));
  const totalPendente = pendentes.reduce((sum: number, p: any) => {
    const cob = cobMap.get(p.cobranca_id);
    return sum + (cob?.valor_parcela || 0);
  }, 0);

  const lines: string[] = [];
  lines.push(`📊 *Resumo Financeiro*`);
  lines.push(``);
  lines.push(`━━━━━━━━━━━━━━━━━━`);
  lines.push(`✅ Parcelas pagas: *${pagas.length}*`);
  lines.push(`📅 Parcelas a vencer: *${pendentes.length - atrasadas.length}*`);
  lines.push(`⚠️ Parcelas atrasadas: *${atrasadas.length}*`);
  lines.push(`💰 Total pendente: *${formatCurrency(totalPendente)}*`);
  lines.push(`━━━━━━━━━━━━━━━━━━`);

  if (pendentes.length > 0) {
    lines.push(``);
    lines.push(`📋 *Próximas parcelas:*`);
    pendentes.slice(0, 5).forEach((p: any, i: number) => {
      const cob = cobMap.get(p.cobranca_id);
      const statusIcon = p.status === "pendente" ? "🔴 ATRASADA" : "🔵 A pagar";
      lines.push(`  ${i + 1}. ${statusIcon} — ${formatDate(p.data_vencimento)} — ${cob ? formatCurrency(cob.valor_parcela) : "N/A"}`);
    });
  }

  return {
    summary: lines.join("\n"),
    parcelas: pendentes.slice(0, 10).map((p: any, i: number) => ({
      index: i + 1,
      cobranca_id: p.cobranca_id,
      data_vencimento: p.data_vencimento,
      valor: cobMap.get(p.cobranca_id)?.valor_parcela || 0,
      status: p.status,
    })),
    totalPendente,
  };
}

// ─── Main Handler ───

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (!isAuthorizedRequest(req)) {
      console.warn("[financial-agent] Unauthorized request", {
        hasN8nToken: !!Deno.env.get("N8N_CALLBACK_TOKEN"),
        hasServiceRole: !!Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
        authSource: req.headers.get("x-n8n-token")
          ? "x-n8n-token"
          : req.headers.get("authorization")
          ? "authorization"
          : req.headers.get("apikey")
          ? "apikey"
          : "none",
      });

      return new Response(
        JSON.stringify({ success: false, error: "Token inválido" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const body = await req.json();
    const { phone, message, cpf, action, context_id } = body as {
      phone: string;
      message?: string;
      cpf?: string;
      action?: string;
      context_id?: string;
    };

    if (!phone) {
      return new Response(
        JSON.stringify({ success: false, error: "phone é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const cleanPhone = phone.replace(/\D/g, "").replace(/^0/, "");
    const fullPhone = cleanPhone.startsWith("55") ? cleanPhone : `55${cleanPhone}`;

    // ─── ACTION: Detect intent from message ───
    if (action === "detect_intent" && message) {
      const intent = detectIntent(message);
      return new Response(
        JSON.stringify({
          success: true,
          intent,
          should_handle: intent !== "general",
          description: intent === "financial"
              ? "Assunto financeiro detectado — agente local deve processar"
            : intent === "data"
              ? "Alteração de dados sensíveis — agente local deve processar"
            : "Conversa geral — agente local pode responder normalmente",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── ACTION: Consulta financeira completa ───
    if (action === "consulta_financeira" || action === "financial_query") {
      // Identify client by CPF or phone
      let cliente = null;
      if (cpf) {
        cliente = await lookupClienteByCpf(supabase, cpf);
      }
      if (!cliente) {
        cliente = await lookupClienteByPhone(supabase, fullPhone);
      }

      if (!cliente) {
        const transitionMsg = "Entendido. Vou acessar os detalhes do seu financeiro agora... 🔍\n\n" +
          "❌ Não consegui localizar seu cadastro automaticamente. " +
          "Por favor, me informe seu *CPF* para que eu possa consultar suas informações.";

        return new Response(
          JSON.stringify({
            success: true,
            action: "awaiting_cpf",
            message: "Cliente não encontrado, CPF solicitado",
            reply_text: transitionMsg,
            message_sent: false,
            delivery_error: "delivery_delegated_to_webhook",
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      await randomDelay(10, 18);

      const { summary, parcelas, totalPendente } = await fetchFinancialSummary(supabase, cliente.id);

      const fullMessage = [
        `Olá, *${cliente.nome}*! 👋`,
        ``,
        summary,
        ``,
        parcelas.length > 0
          ? `💳 Para pagar uma parcela, basta digitar *pagar* a qualquer momento!`
          : ``,
        ``,
        `_Se precisar de algo mais, estou aqui!_ 😊`,
      ].filter(Boolean).join("\n");

      // Log
      await supabase.from("audit_log").insert({
        tabela: "financial_agent",
        acao: "consulta_financeira",
        registro_id: cliente.id,
        detalhes: {
          via: "whatsapp_local_agent",
          phone: fullPhone,
          total_pendente: totalPendente,
          parcelas_pendentes: parcelas.length,
          context_id,
        },
      });

      // Handover back to n8n
      await notifyN8nHandover("financeiro_concluido", fullPhone, {
        cliente_id: cliente.id,
        cliente_nome: cliente.nome,
        total_pendente: totalPendente,
        parcelas_pendentes: parcelas.length,
        context_id,
      });

      return new Response(
        JSON.stringify({
          success: true,
          action: "consulta_financeira",
          cliente: { id: cliente.id, nome: cliente.nome },
          total_pendente: totalPendente,
          parcelas_pendentes: parcelas.length,
          reply_text: fullMessage,
          message_sent: false,
          delivery_error: "delivery_delegated_to_webhook",
          status: "financeiro_concluido",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── ACTION: Gerar link PIX ───
    if (action === "gerar_pix") {
      const { cobranca_id, data_vencimento, valor, cliente_nome } = body as {
        cobranca_id: string;
        data_vencimento: string;
        valor: number;
        cliente_nome?: string;
      };

      if (!cobranca_id || !data_vencimento || !valor) {
        return new Response(
          JSON.stringify({ success: false, error: "cobranca_id, data_vencimento e valor são obrigatórios" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const appUrl = "https://veloopsr.lovable.app";
      const pixLink = `${appUrl}/pagar/${cobranca_id}/${data_vencimento}?valor=${valor}&cliente=${encodeURIComponent(cliente_nome || "")}`;

      const pixMessage = [
        `✅ *Link PIX Gerado!*`,
        ``,
        `💰 *Valor:* ${formatCurrency(valor)}`,
        `📅 *Vencimento:* ${formatDate(data_vencimento)}`,
        ``,
        `━━━━━━━━━━━━━━━━━━`,
        `💳 *Clique para pagar:*`,
        pixLink,
        `━━━━━━━━━━━━━━━━━━`,
        ``,
        `📱 No link você encontra o *QR Code* e o *PIX Copia e Cola*.`,
        `_O pagamento será confirmado automaticamente!_ 🎉`,
      ].join("\n");

      await notifyN8nHandover("financeiro_concluido", fullPhone, {
        action: "pix_gerado",
        cobranca_id,
        valor,
        context_id,
      });

      return new Response(
        JSON.stringify({
          success: true,
          action: "pix_gerado",
          pix_link: pixLink,
          reply_text: pixMessage,
          message_sent: false,
          delivery_error: "delivery_delegated_to_webhook",
          status: "financeiro_concluido",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── ACTION: Atualizar dados sensíveis ───
    if (action === "atualizar_dados") {
      const { campo, novo_valor } = body as { campo?: string; novo_valor?: string };

      let cliente = cpf ? await lookupClienteByCpf(supabase, cpf) : null;
      if (!cliente) cliente = await lookupClienteByPhone(supabase, fullPhone);

      if (!cliente) {
        return new Response(
          JSON.stringify({ success: false, error: "Cliente não encontrado" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const allowedFields = ["telefone", "email", "endereco", "cep", "bairro", "cidade", "uf", "complemento"];
      if (!campo || !allowedFields.includes(campo)) {
        return new Response(
          JSON.stringify({ success: false, error: `Campo inválido. Campos permitidos: ${allowedFields.join(", ")}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { error: updateError } = await supabase.from("clientes")
        .update({ [campo]: novo_valor }).eq("id", cliente.id);
      if (updateError) throw updateError;

      const confirmMsg = `✅ *Dados Atualizados!*\n\nO campo *${campo}* do cadastro de *${cliente.nome}* foi atualizado com sucesso.\n\n_Se precisar de mais alguma alteração, é só falar!_ 😊`;

      await supabase.from("audit_log").insert({
        tabela: "clientes",
        acao: "financial_agent_atualizar_dados",
        registro_id: cliente.id,
        detalhes: { campo, via: "whatsapp_local_agent", context_id },
      });

      await notifyN8nHandover("financeiro_concluido", fullPhone, {
        action: "dados_atualizados",
        campo,
        cliente_id: cliente.id,
        context_id,
      });

      return new Response(
        JSON.stringify({
          success: true,
          action: "dados_atualizados",
          campo,
          reply_text: confirmMsg,
          message_sent: false,
          delivery_error: "delivery_delegated_to_webhook",
          status: "financeiro_concluido",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── ACTION: Handover de volta ao n8n ───
    if (action === "handover_n8n") {
      const exitMsg = "Certo, a parte financeira foi resolvida. Vou te passar de volta para nosso assistente de atendimento para continuar com suas outras dúvidas. 😊";

      await notifyN8nHandover("financeiro_concluido", fullPhone, {
        action: "handover_manual",
        context_id,
      });

      return new Response(
        JSON.stringify({
          success: true,
          status: "financeiro_concluido",
          reply_text: exitMsg,
            message_sent: false,
            delivery_error: "delivery_delegated_to_webhook",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: false,
        error: `Ação '${action}' não reconhecida. Ações: detect_intent, consulta_financeira, gerar_pix, atualizar_dados, handover_n8n`,
      }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[financial-agent] Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

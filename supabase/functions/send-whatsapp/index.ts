import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface SendWhatsAppRequest {
  telefone: string;
  mensagem?: string;
  instancia?: string;
  // Billing context (optional) — when provided, generates AI message + registers in envio_cobranca
  cobranca_id?: string;
  cliente_id?: string;
  cliente_nome?: string;
  cpf?: string;
  valor?: number;
  data_vencimento?: string;
  status_parcela?: string;
}

function formatPhoneNumber(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("55") && digits.length >= 12) return digits;
  const withoutZero = digits.startsWith("0") ? digits.slice(1) : digits;
  return `55${withoutZero}`;
}

function formatDateBR(dateStr: string): string {
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
}

function formatCurrency(valor: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valor);
}

function getTipoCobranca(dataVencimento: string): "D-1" | "D0" | "atrasado" | "futuro" {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const tomorrow = new Date(now.getTime() + 86400000).toISOString().slice(0, 10);
  if (dataVencimento === today) return "D0";
  if (dataVencimento === tomorrow) return "D-1";
  if (dataVencimento < today) return "atrasado";
  return "futuro";
}

async function generateAIMessage(
  clienteNome: string,
  cpf: string,
  valor: string,
  dataFormatada: string,
  tipo: "D-1" | "D0" | "atrasado" | "futuro"
): Promise<string> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

  const tomMap: Record<string, string> = {
    "D-1": "preventivo e cordial, informando que a fatura vence AMANHÃ",
    "D0": "mais urgente e direto, informando que a fatura vence HOJE",
    "atrasado": "firme e respeitoso, informando que a fatura está EM ATRASO",
    "futuro": "informativo e cordial, informando sobre a próxima fatura",
  };
  const diaRefMap: Record<string, string> = {
    "D-1": "amanhã",
    "D0": "hoje",
    "atrasado": `no dia ${dataFormatada} (em atraso)`,
    "futuro": `no dia ${dataFormatada}`,
  };

  const tom = tomMap[tipo];
  const diaRef = diaRefMap[tipo];

  const fallback = `Prezado(a) Sr(a). *${clienteNome}*,\n\nInformamos que a fatura vinculada ao CPF *${cpf}*, no valor de *${valor}*, ${tipo === "atrasado" ? `teve vencimento em *${dataFormatada}* e encontra-se em atraso` : `possui vencimento ${diaRef}`}.\n\n${tipo === "atrasado" ? "Solicitamos a regularização o mais breve possível para evitar encargos adicionais." : "Solicitamos, por gentileza, que o pagamento seja realizado até a data informada."}\n\nCaso o pagamento já tenha sido efetuado, pedimos que desconsidere esta mensagem.\n\nAtenciosamente,\n*SR SOFTWARE*\n_Powered by Veloop_`;

  if (!LOVABLE_API_KEY) return fallback;

  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: `Você gera mensagens de cobrança formais, elegantes e objetivas em nome da empresa SR SOFTWARE para envio via WhatsApp. Use formatação WhatsApp (*negrito*). Não use saudações como 'Bom dia/Boa tarde'. Seja breve (máximo 8 linhas). O tom deve ser ${tom}. Sempre finalize com:\nAtenciosamente,\n*SR SOFTWARE*\n_Powered by Veloop_`,
          },
          {
            role: "user",
            content: `Gere uma mensagem formal de cobrança com os seguintes dados:\n- Nome completo: ${clienteNome}\n- CPF: ${cpf}\n- Valor: ${valor}\n- Data de vencimento: ${dataFormatada}\n- Situação: a fatura vence ${diaRef}.\n\nInclua uma frase pedindo para desconsiderar caso já tenha sido pago.`,
          },
        ],
      }),
    });

    if (!res.ok) {
      console.error("AI gateway error:", res.status, await res.text());
      return fallback;
    }

    const data = await res.json();
    return data.choices?.[0]?.message?.content?.trim() || fallback;
  } catch (err) {
    console.error("AI generation error:", err);
    return fallback;
  }
}

async function sendEvolutionMessage(
  telefone: string,
  mensagem: string,
  instancia: string
): Promise<{ success: boolean; error?: string }> {
  const apiUrl = Deno.env.get("EVOLUTION_API_URL");
  const apiKey = Deno.env.get("EVOLUTION_API_KEY");

  if (!apiUrl) return { success: false, error: "EVOLUTION_API_URL não configurada" };
  if (!apiKey) return { success: false, error: "EVOLUTION_API_KEY não configurada" };

  const formattedPhone = formatPhoneNumber(telefone);
  const url = `${apiUrl}/message/sendText/${instancia}`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: apiKey },
      body: JSON.stringify({ number: formattedPhone, text: mensagem }),
    });

    const data = await response.json();
    if (!response.ok) {
      console.error("Evolution API error:", JSON.stringify(data));
      return { success: false, error: `Evolution API [${response.status}]: ${JSON.stringify(data)}` };
    }

    return { success: true };
  } catch (err) {
    console.error("Network error sending WhatsApp:", err);
    return { success: false, error: `Erro de conexão: ${err instanceof Error ? err.message : String(err)}` };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: "Não autorizado" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: "Sessão inválida" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body: SendWhatsAppRequest = await req.json();
    const { telefone, instancia = "Veloop" } = body;

    if (!telefone) {
      return new Response(
        JSON.stringify({ success: false, error: "Telefone é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const serviceClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const isBillingContext = !!(body.cobranca_id && body.cliente_nome && body.cpf && body.valor && body.data_vencimento);

    let mensagemFinal = body.mensagem || "";

    if (isBillingContext) {
      const todayStr = new Date().toISOString().slice(0, 10);

      // ── DEDUP: verificar se já enviou para esse CPF hoje ──
      const { data: jaEnviado } = await serviceClient
        .from("envio_cobranca")
        .select("id")
        .eq("cpf", body.cpf!)
        .eq("data_envio", todayStr)
        .limit(1);

      if (jaEnviado && jaEnviado.length > 0) {
        return new Response(
          JSON.stringify({ success: false, error: "Mensagem já enviada para este cliente hoje", duplicado: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // ── Gerar mensagem com IA baseada nos dados da cobrança ──
      const tipo = getTipoCobranca(body.data_vencimento!);
      const dataFormatada = formatDateBR(body.data_vencimento!);
      const valorFormatado = formatCurrency(body.valor!);

      mensagemFinal = await generateAIMessage(
        body.cliente_nome!,
        body.cpf!,
        valorFormatado,
        dataFormatada,
        tipo
      );
    }

    if (!mensagemFinal) {
      return new Response(
        JSON.stringify({ success: false, error: "Mensagem é obrigatória" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Enviar WhatsApp ──
    const result = await sendEvolutionMessage(telefone, mensagemFinal, instancia);

    // ── Registrar no envio_cobranca (quando contexto de cobrança) ──
    if (isBillingContext) {
      const todayStr = new Date().toISOString().slice(0, 10);
      const tipo = getTipoCobranca(body.data_vencimento!);

      try {
        await serviceClient.from("envio_cobranca").insert({
          cobranca_id: body.cobranca_id,
          cliente_id: body.cliente_id || null,
          cpf: body.cpf!,
          telefone,
          data_envio: todayStr,
          tipo_envio: tipo,
          status_fatura: body.status_parcela || "a_pagar",
          mensagem: mensagemFinal,
          enviado_com_sucesso: result.success,
        });
      } catch (insertErr) {
        console.warn("Insert envio_cobranca falhou (possível duplicata):", insertErr);
      }
    }

    // ── Audit log ──
    await serviceClient.from("audit_log").insert({
      user_id: user.id,
      tabela: "whatsapp",
      acao: result.success ? "envio_sucesso" : "envio_falha",
      detalhes: {
        telefone: telefone.replace(/\d(?=\d{4})/g, "*"),
        sucesso: result.success,
        erro: result.error || null,
        cobranca_id: body.cobranca_id || null,
        billing_context: isBillingContext,
      },
    });

    if (!result.success) {
      return new Response(
        JSON.stringify({ success: false, error: result.error }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, mensagem_enviada: mensagemFinal }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("send-whatsapp error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

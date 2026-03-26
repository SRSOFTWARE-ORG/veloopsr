import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface SendWhatsAppRequest {
  telefone: string;
  mensagem: string;
  instancia?: string;
}

function formatPhoneNumber(phone: string): string {
  // Remove tudo que não é número
  const digits = phone.replace(/\D/g, "");

  // Se já começa com 55, usar direto
  if (digits.startsWith("55") && digits.length >= 12) {
    return digits;
  }

  // Se começa com 0, remover
  const withoutZero = digits.startsWith("0") ? digits.slice(1) : digits;

  // Adicionar código do país 55
  return `55${withoutZero}`;
}

async function sendEvolutionMessage(
  telefone: string,
  mensagem: string,
  instancia: string
): Promise<{ success: boolean; error?: string }> {
  const apiUrl = Deno.env.get("EVOLUTION_API_URL");
  const apiKey = Deno.env.get("EVOLUTION_API_KEY");

  if (!apiUrl) {
    return { success: false, error: "EVOLUTION_API_URL não configurada" };
  }
  if (!apiKey) {
    return { success: false, error: "EVOLUTION_API_KEY não configurada" };
  }

  const formattedPhone = formatPhoneNumber(telefone);
  const url = `${apiUrl}/message/sendText/${instancia}`;

  console.log(`Sending WhatsApp to ${formattedPhone} via ${url}`);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: apiKey,
      },
      body: JSON.stringify({
        number: formattedPhone,
        text: mensagem,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Evolution API error:", JSON.stringify(data));
      return {
        success: false,
        error: `Evolution API [${response.status}]: ${JSON.stringify(data)}`,
      };
    }

    console.log("WhatsApp sent successfully:", JSON.stringify(data));
    return { success: true };
  } catch (err) {
    console.error("Network error sending WhatsApp:", err);
    return {
      success: false,
      error: `Erro de conexão: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validar autenticação
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
    const { telefone, mensagem, instancia = "Veloop" } = body;

    if (!telefone || !mensagem) {
      return new Response(
        JSON.stringify({ success: false, error: "Telefone e mensagem são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const result = await sendEvolutionMessage(telefone, mensagem, instancia);

    // Log no audit_log
    const serviceClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    await serviceClient.from("audit_log").insert({
      user_id: user.id,
      tabela: "whatsapp",
      acao: result.success ? "envio_sucesso" : "envio_falha",
      detalhes: {
        telefone: telefone.replace(/\d(?=\d{4})/g, "*"),
        sucesso: result.success,
        erro: result.error || null,
      },
    });

    if (!result.success) {
      return new Response(
        JSON.stringify({ success: false, error: result.error }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true }),
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

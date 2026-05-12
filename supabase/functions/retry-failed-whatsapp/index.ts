import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // 1. Encontrar envios de cobrança que falharam (enviado_com_sucesso = false) desde sexta-feira (2026-05-08)
    const { data: enviosFalhos, error: fetchError } = await supabase
      .from("envio_cobranca")
      .select("id, telefone, mensagem, cobranca_id, cliente_id, cpf, status_fatura, tipo_envio")
      .eq("enviado_com_sucesso", false)
      .gte("criado_em", "2026-05-08T00:00:00Z")
      .order("criado_em", { ascending: true });

    if (fetchError) throw fetchError;
    if (!enviosFalhos?.length) {
      return new Response(JSON.stringify({ success: true, message: "Nenhum envio pendente encontrado desde 08/05." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let successCount = 0;
    let failCount = 0;
    const results = [];

    // 2. Tentar reenviar cada um diretamente para a UAZAPI
    const UAZAPI_URL = Deno.env.get("UAZAPI_URL");
    const UAZAPI_TOKEN = Deno.env.get("UAZAPI_TOKEN");

    if (!UAZAPI_URL || !UAZAPI_TOKEN) {
      throw new Error("UAZAPI não configurada (URL ou Token ausentes no ambiente)");
    }

    const apiUrl = UAZAPI_URL.replace(/\/+$/, "");

    for (const envio of enviosFalhos) {
      try {
        // Normalização de telefone
        let phone = envio.telefone.replace(/\D/g, "");
        if (phone.startsWith("0")) phone = phone.slice(1);
        if (!phone.startsWith("55")) phone = "55" + phone;

        const response = await fetch(`${apiUrl}/send/text`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "token": UAZAPI_TOKEN,
          },
          body: JSON.stringify({
            number: phone,
            text: envio.mensagem,
            linkPreview: false,
          }),
        });

        const result = await response.json();
        const success = response.ok && !result.error;

        if (success) {
          // Atualizar o registro original para sucesso
          await supabase
            .from("envio_cobranca")
            .update({ enviado_com_sucesso: true })
            .eq("id", envio.id);
          
          successCount++;
          results.push({ id: envio.id, status: "success" });
        } else {
          failCount++;
          results.push({ id: envio.id, status: "fail", error: result.error || response.statusText });
        }
      } catch (err) {
        failCount++;
        results.push({ id: envio.id, status: "error", error: err instanceof Error ? err.message : String(err) });
      }

      // Pequeno delay entre envios para evitar bloqueios
      await new Promise(r => setTimeout(r, 1000));
    }

    return new Response(JSON.stringify({
      success: true,
      total: enviosFalhos.length,
      reenviados: successCount,
      falhas: failCount,
      detalhes: results
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Erro desconhecido" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

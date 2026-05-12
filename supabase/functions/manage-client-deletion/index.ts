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

    const { action, cliente_id } = await req.json();

    if (action === "pre_check") {
      const [cob, disp, assist, sub, pix, comDest] = await Promise.all([
        supabase.from("cobrancas").select("id").eq("cliente_id", cliente_id),
        supabase.from("dispositivos").select("id").or(`cliente_id.eq.${cliente_id},subcliente_id.eq.${cliente_id}`),
        supabase.from("assistencias").select("id").eq("cliente_id", cliente_id),
        supabase.from("clientes").select("id").eq("parent_id", cliente_id),
        supabase.from("pix_payments").select("id").eq("cliente_id", cliente_id),
        supabase.from("comunicado_destinatarios").select("id").eq("cliente_id", cliente_id),
      ]);

      const counts = {
        cobrancas: cob.data?.length || 0,
        dispositivos: disp.data?.length || 0,
        assistencias: assist.data?.length || 0,
        subclientes: sub.data?.length || 0,
        pix: pix.data?.length || 0,
        comunicados: comDest.data?.length || 0,
      };

      return new Response(JSON.stringify({ success: true, counts }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "delete_cascade") {
      // 1. Obter todos os IDs de cobrança para limpar pagamentos e logs
      const { data: cobrancas } = await supabase.from("cobrancas").select("id").eq("cliente_id", cliente_id);
      const cobrancaIds = cobrancas?.map(c => c.id) || [];

      // Sequência de deleção manual simulando cascata transacional (via Service Role)
      if (cobrancaIds.length > 0) {
        await supabase.from("cobranca_pagamentos").delete().in("cobranca_id", cobrancaIds);
        await supabase.from("envio_cobranca").delete().in("cobranca_id", cobrancaIds);
        await supabase.from("pix_payments").delete().in("cobranca_id", cobrancaIds);
        await supabase.from("cobrancas").delete().in("id", cobrancaIds);
      }

      await supabase.from("pix_payments").delete().eq("cliente_id", cliente_id);
      await supabase.from("comunicado_destinatarios").delete().eq("cliente_id", cliente_id);
      await supabase.from("assistencias").delete().eq("cliente_id", cliente_id);
      await supabase.from("dispositivos").delete().or(`cliente_id.eq.${cliente_id},subcliente_id.eq.${cliente_id}`);
      await supabase.from("clientes").delete().eq("parent_id", cliente_id);

      const { error: deleteError } = await supabase.from("clientes").delete().eq("id", cliente_id);
      if (deleteError) throw deleteError;

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: false, error: "Ação inválida" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    console.error("manage-client-deletion error:", error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error.message,
      code: error.code,
      details: error.details
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

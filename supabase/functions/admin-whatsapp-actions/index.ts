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

    const { action } = await req.json();

    if (action === "summary") {
      const [whatsappPending, pixPending] = await Promise.all([
        supabase.from("envio_cobranca").select("id", { count: "exact" }).eq("enviado_com_sucesso", false).gte("criado_em", "2026-05-08T00:00:00Z"),
        supabase.from("pix_payments").select("id", { count: "exact" }).eq("status", "pending").gte("created_at", "2026-05-08T00:00:00Z"),
      ]);

      return new Response(JSON.stringify({
        success: true,
        summary: {
          whatsapp_pending: whatsappPending.count || 0,
          pix_pending: pixPending.count || 0,
        }
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "resend_all") {
      const { data: pending } = await supabase
        .from("envio_cobranca")
        .select("*")
        .eq("enviado_com_sucesso", false)
        .gte("criado_em", "2026-05-08T00:00:00Z");

      if (!pending?.length) {
        return new Response(JSON.stringify({ success: true, count: 0 }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const UAZAPI_URL = Deno.env.get("UAZAPI_URL")!;
      const UAZAPI_TOKEN = Deno.env.get("UAZAPI_TOKEN")!;
      const apiUrl = UAZAPI_URL.replace(/\/+$/, "");

      let successCount = 0;
      for (const msg of pending) {
        try {
          let phone = msg.telefone.replace(/\D/g, "");
          if (phone.startsWith("0")) phone = phone.slice(1);
          if (!phone.startsWith("55")) phone = "55" + phone;

          const res = await fetch(`${apiUrl}/send/text`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "token": UAZAPI_TOKEN },
            body: JSON.stringify({ number: phone, text: msg.mensagem, linkPreview: false }),
          });

          const data = await res.json();
          if (res.ok && !data.error) {
            await supabase.from("envio_cobranca").update({ enviado_com_sucesso: true }).eq("id", msg.id);
            await supabase.from("whatsapp_resend_logs").insert({ envio_id: msg.id, status: "sucesso" });
            successCount++;
          } else {
            await supabase.from("whatsapp_resend_logs").insert({ envio_id: msg.id, status: "falha", erro: data.error || res.statusText });
          }
          await new Promise(r => setTimeout(r, 1000));
        } catch (e) {
          console.error("Resend error for msg", msg.id, e);
        }
      }

      return new Response(JSON.stringify({ success: true, count: successCount }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: false, error: "Ação inválida" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function randomDelay(min: number, max: number): Promise<void> {
  const ms = Math.floor(Math.random() * (max - min + 1) + min) * 1000;
  return new Promise((r) => setTimeout(r, ms));
}

function sanitizePhone(phone: string): string | null {
  let cleaned = phone.replace(/\D/g, "");
  if (cleaned.startsWith("0")) cleaned = cleaned.slice(1);
  if (!cleaned.startsWith("55")) cleaned = "55" + cleaned;
  // Must be 12-13 digits (55 + DDD + number)
  if (cleaned.length < 12 || cleaned.length > 13) return null;
  return cleaned;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify user
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Sessão inválida" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const serviceClient = createClient(supabaseUrl, serviceKey);

    const body = await req.json();
    const { comunicado_id, test_phone, test_name } = body;

    const isTest = !!test_phone;

    const UAZAPI_URL = Deno.env.get("UAZAPI_URL");
    const UAZAPI_TOKEN = Deno.env.get("UAZAPI_TOKEN");

    if (!UAZAPI_URL || !UAZAPI_TOKEN) {
      return new Response(JSON.stringify({ error: "UAZAPI não configurada" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiUrl = UAZAPI_URL.replace(/\/+$/, "");

    // Test mode: send single message
    if (isTest) {
      const phone = sanitizePhone(test_phone);
      if (!phone) {
        return new Response(JSON.stringify({ error: "Número de teste inválido" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { mensagem, formato, media_url } = body;
      const finalMsg = (mensagem || "").replace(/\{\{nome\}\}/gi, test_name || "Cliente");

      let success = false;
      if (formato === "midia" && media_url) {
        const res = await fetch(`${apiUrl}/send/media`, {
          method: "POST",
          headers: { "Content-Type": "application/json", token: UAZAPI_TOKEN },
          body: JSON.stringify({ number: phone, media: media_url, caption: finalMsg, linkPreview: false }),
        });
        const r = await res.json();
        success = res.ok && !r.error;
      } else {
        const res = await fetch(`${apiUrl}/send/text`, {
          method: "POST",
          headers: { "Content-Type": "application/json", token: UAZAPI_TOKEN },
          body: JSON.stringify({ number: phone, text: finalMsg, linkPreview: false }),
        });
        const r = await res.json();
        success = res.ok && !r.error;
      }

      return new Response(JSON.stringify({ success, test: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Bulk mode
    if (!comunicado_id) {
      return new Response(JSON.stringify({ error: "comunicado_id obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get comunicado
    const { data: comunicado } = await serviceClient
      .from("comunicados")
      .select("*")
      .eq("id", comunicado_id)
      .single();

    if (!comunicado) {
      return new Response(JSON.stringify({ error: "Comunicado não encontrado" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get all clients with phone
    const { data: clientes } = await serviceClient
      .from("clientes")
      .select("id, nome, telefone")
      .not("telefone", "is", null);

    if (!clientes || clientes.length === 0) {
      return new Response(JSON.stringify({ error: "Nenhum cliente com telefone cadastrado" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get blacklist
    const { data: blacklist } = await serviceClient
      .from("whatsapp_blacklist")
      .select("telefone");

    const blackSet = new Set((blacklist || []).map((b: any) => sanitizePhone(b.telefone)).filter(Boolean));

    // Deduplicate by sanitized phone
    const seen = new Set<string>();
    const recipients: { id: string; nome: string; telefone: string; sanitized: string }[] = [];

    for (const c of clientes) {
      const sanitized = sanitizePhone(c.telefone || "");
      if (!sanitized || seen.has(sanitized) || blackSet.has(sanitized)) continue;
      seen.add(sanitized);
      recipients.push({ id: c.id, nome: c.nome, telefone: c.telefone, sanitized });
    }

    // Update comunicado status
    await serviceClient.from("comunicados").update({
      status: "enviando",
      total_destinatarios: recipients.length,
      total_enviados: 0,
      total_falhas: 0,
    }).eq("id", comunicado_id);

    // Insert all recipients as pending
    const destRows = recipients.map((r) => ({
      comunicado_id,
      cliente_id: r.id,
      nome: r.nome,
      telefone: r.telefone,
      status: "pendente",
    }));

    // Insert in batches of 500
    for (let i = 0; i < destRows.length; i += 500) {
      await serviceClient.from("comunicado_destinatarios").insert(destRows.slice(i, i + 500));
    }

    // Send messages one by one with random delay
    let enviados = 0;
    let falhas = 0;

    for (const r of recipients) {
      const firstName = r.nome.split(" ")[0];
      const finalMsg = comunicado.mensagem.replace(/\{\{nome\}\}/gi, firstName);

      let success = false;
      let erro = "";

      try {
        if (comunicado.formato === "midia" && comunicado.media_url) {
          const res = await fetch(`${apiUrl}/send/media`, {
            method: "POST",
            headers: { "Content-Type": "application/json", token: UAZAPI_TOKEN },
            body: JSON.stringify({ number: r.sanitized, media: comunicado.media_url, caption: finalMsg, linkPreview: false }),
          });
          const result = await res.json();
          success = res.ok && !result.error;
          if (!success) erro = result.error || `HTTP ${res.status}`;
        } else {
          const res = await fetch(`${apiUrl}/send/text`, {
            method: "POST",
            headers: { "Content-Type": "application/json", token: UAZAPI_TOKEN },
            body: JSON.stringify({ number: r.sanitized, text: finalMsg, linkPreview: false }),
          });
          const result = await res.json();
          success = res.ok && !result.error;
          if (!success) erro = result.error || `HTTP ${res.status}`;
        }
      } catch (e) {
        erro = e instanceof Error ? e.message : "Erro de conexão";
      }

      if (success) enviados++;
      else falhas++;

      // Update individual recipient status
      await serviceClient
        .from("comunicado_destinatarios")
        .update({
          status: success ? "enviado" : "falha",
          erro: erro || null,
          enviado_em: success ? new Date().toISOString() : null,
        })
        .eq("comunicado_id", comunicado_id)
        .eq("telefone", r.telefone);

      // Update comunicado counters
      await serviceClient.from("comunicados").update({
        total_enviados: enviados,
        total_falhas: falhas,
      }).eq("id", comunicado_id);

      // Random delay 15-30s between sends (anti-ban)
      if (recipients.indexOf(r) < recipients.length - 1) {
        await randomDelay(15, 30);
      }
    }

    // Final status
    await serviceClient.from("comunicados").update({
      status: falhas === recipients.length ? "falha" : "concluido",
      total_enviados: enviados,
      total_falhas: falhas,
      updated_at: new Date().toISOString(),
    }).eq("id", comunicado_id);

    // Audit log
    await serviceClient.from("audit_log").insert({
      user_id: user.id,
      tabela: "comunicados",
      acao: "disparo_comunicado",
      registro_id: comunicado_id,
      detalhes: { total: recipients.length, enviados, falhas },
    });

    // Dispatch webhook to n8n with full campaign data
    const n8nUrl = Deno.env.get("N8N_WEBHOOK_URL");
    if (n8nUrl) {
      try {
        const clientesList = recipients.map((r) => ({
          nome: r.nome,
          telefone: r.sanitized,
        }));
        await fetch(n8nUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            event: "comunicado_enviado",
            comunicado_id,
            titulo: comunicado.titulo,
            mensagem: comunicado.mensagem,
            formato: comunicado.formato,
            clientes: clientesList,
            resultado: { total: recipients.length, enviados, falhas },
            timestamp: new Date().toISOString(),
            source: "veloop",
          }),
        });
      } catch (e) {
        console.error("[Webhook n8n] Error:", e);
      }
    }

    return new Response(
      JSON.stringify({ success: true, total: recipients.length, enviados, falhas }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("send-comunicado error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

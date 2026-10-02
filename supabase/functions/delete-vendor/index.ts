import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user: caller } } = await supabaseAdmin.auth.getUser(token);

    if (!caller) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: isAdmin } = await supabaseAdmin.rpc("has_role", {
      _user_id: caller.id,
      _role: "admin",
    });

    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Apenas administradores podem excluir vendedores" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { user_id } = await req.json();

    if (!user_id) {
      return new Response(JSON.stringify({ error: "user_id é obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (user_id === caller.id) {
      return new Response(JSON.stringify({ error: "Você não pode excluir a si mesmo" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Protect the founder from deletion
    const { data: targetUser } = await supabaseAdmin.auth.admin.getUserById(user_id);
    if (targetUser?.user?.email === "srcj9975@gmail.com") {
      return new Response(JSON.stringify({ error: "O CEO fundador não pode ser excluído" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Reatribui ao admin que está excluindo TODOS os registros que apontam para o usuário.
    // Sem isso o banco recusa a exclusão ("Database error deleting user").
    const reassign: Array<[string, string]> = [
      ["vendas", "vendedor_id"],
      ["assistencias", "vendedor_id"],
      ["cobrancas", "criado_por"],
      ["saidas_caixa", "responsavel_id"],
      ["saidas_caixa", "registrado_por"],
      ["clientes", "criado_por"],
      ["documentos", "uploaded_by"],
      ["estoque_movimentacao", "usuario_id"],
      ["produtos", "atualizado_por"],
      ["checklist_entrega", "verificado_por"],
      ["audit_log", "user_id"],
      ["comunicados", "criado_por"],
      ["cobranca_sub_parcelas", "criado_por"],
      ["cobranca_pagamentos", "pago_por"],
    ];
    for (const [table, col] of reassign) {
      const { error } = await supabaseAdmin.from(table).update({ [col]: caller.id }).eq(col, user_id);
      if (error) console.warn(`reassign ${table}.${col}:`, error.message);
    }

    // Remove dados pessoais do usuário
    for (const [table, col] of [
      ["permissions", "user_id"],
      ["user_roles", "user_id"],
      ["notificacoes", "user_id"],
      ["push_subscriptions", "user_id"],
      ["calendar_sync", "user_id"],
      ["google_calendar_tokens", "user_id"],
      ["profiles", "id"],
    ] as const) {
      const { error } = await supabaseAdmin.from(table).delete().eq(col, user_id);
      if (error) console.warn(`delete ${table}:`, error.message);
    }
    await supabaseAdmin.storage.from("produto_imagens").remove([`avatars/${user_id}.jpg`]);

    // Delete the auth user
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(user_id);

    if (deleteError) {
      console.error("deleteUser failed:", deleteError.message);
      return new Response(JSON.stringify({ error: `Não foi possível excluir: ${deleteError.message}` }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

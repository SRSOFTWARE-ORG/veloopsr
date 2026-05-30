import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { email } = await req.json();

    if (!email || typeof email !== "string" || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // ── ANTI-ABUSO: máximo 5 solicitações por email por hora ──
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count: recentCount } = await supabaseAdmin
      .from("audit_log")
      .select("id", { count: "exact", head: true })
      .eq("tabela", "forgot_password")
      .gte("created_at", oneHourAgo)
      .contains("detalhes", { email: normalizedEmail });

    if ((recentCount || 0) >= 5) {
      // Sempre responder 200 para não vazar info, mas não notificar admins.
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await supabaseAdmin.from("audit_log").insert({
      tabela: "forgot_password",
      acao: "request",
      detalhes: { email: normalizedEmail, ip: req.headers.get("x-forwarded-for") || "" },
    });

    // Find user by email
    const { data: { users } } = await supabaseAdmin.auth.admin.listUsers();
    const user = users?.find((u: any) => (u.email || "").toLowerCase() === normalizedEmail);

    if (!user) {
      // Don't reveal if user exists or not
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }


    // Get user profile name
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("nome")
      .eq("id", user.id)
      .maybeSingle();

    const userName = profile?.nome || email;

    // Find all admins to notify
    const { data: adminRoles } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin");

    if (adminRoles && adminRoles.length > 0) {
      const notifications = adminRoles.map((r) => ({
        user_id: r.user_id,
        titulo: "Esqueceu a senha",
        mensagem: `O usuário "${userName}" (${email}) solicitou recuperação de senha. Acesse Configurações para redefinir.`,
        tipo: "alerta",
      }));

      await supabaseAdmin.from("notificacoes").insert(notifications);
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

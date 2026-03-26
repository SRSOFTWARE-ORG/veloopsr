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

    if (!email) {
      return new Response(JSON.stringify({ error: "Email é obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Find user by email
    const { data: { users } } = await supabaseAdmin.auth.admin.listUsers();
    const user = users?.find((u: any) => u.email === email);

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

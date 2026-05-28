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

    const authHeader = req.headers.get("Authorization")!;
    const token = authHeader.replace("Bearer ", "");
    const { data: { user: caller } } = await supabaseAdmin.auth.getUser(token);

    if (!caller) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const FOUNDER_EMAIL = "srcj9975@gmail.com";

    // Caller must be admin AND (founder OR have profiles.is_ceo = true)
    const { data: isAdmin } = await supabaseAdmin.rpc("has_role", {
      _user_id: caller.id,
      _role: "admin",
    });

    const { data: callerProfile } = await supabaseAdmin
      .from("profiles").select("is_ceo").eq("id", caller.id).maybeSingle();
    const callerIsCeo = !!callerProfile?.is_ceo || caller.email === FOUNDER_EMAIL;

    if (!isAdmin || !callerIsCeo) {
      return new Response(JSON.stringify({ error: "Apenas CEOs podem alterar dados de usuários" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { user_id, nome, email, password } = await req.json();

    if (!user_id) {
      return new Response(JSON.stringify({ error: "ID do usuário é obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Protect the founder: only the founder may edit their own data
    const { data: targetUser } = await supabaseAdmin.auth.admin.getUserById(user_id);
    if (targetUser?.user?.email === FOUNDER_EMAIL && caller.email !== FOUNDER_EMAIL) {
      return new Response(JSON.stringify({ error: "O CEO fundador não pode ser editado por outro usuário" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update auth user (email/password)
    const authUpdate: Record<string, any> = {};
    if (email) authUpdate.email = email;
    if (password) {
      if (password.length < 6) {
        return new Response(JSON.stringify({ error: "A senha deve ter pelo menos 6 caracteres" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      authUpdate.password = password;
    }

    if (Object.keys(authUpdate).length > 0) {
      const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(user_id, authUpdate);
      if (authError) {
        return new Response(JSON.stringify({ error: authError.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Update profile name
    if (nome) {
      const { error: profileError } = await supabaseAdmin
        .from("profiles")
        .update({ nome: nome.trim() })
        .eq("id", user_id);

      if (profileError) {
        return new Response(JSON.stringify({ error: profileError.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
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

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-n8n-token",
};

interface CallbackPayload {
  action: "marcar_pago" | "enviar_notificacao" | "atualizar_cliente" | "criar_cobranca" | "handover";
  data: Record<string, unknown>;
}

function isAuthorizedRequest(req: Request) {
  const expectedToken = Deno.env.get("N8N_CALLBACK_TOKEN");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  const n8nHeaderToken = req.headers.get("x-n8n-token")?.trim();
  const authHeader = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  const apiKeyHeader = req.headers.get("apikey")?.trim();

  const tokenMatches = !!expectedToken && (n8nHeaderToken === expectedToken || authHeader === expectedToken);
  const serviceRoleMatches = !!serviceRoleKey && (authHeader === serviceRoleKey || apiKeyHeader === serviceRoleKey);

  return tokenMatches || serviceRoleMatches;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (!isAuthorizedRequest(req)) {
      console.warn("[n8n-callback] Unauthorized request", {
        hasN8nToken: !!Deno.env.get("N8N_CALLBACK_TOKEN"),
        hasServiceRole: !!Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
        authSource: req.headers.get("x-n8n-token")
          ? "x-n8n-token"
          : req.headers.get("authorization")
          ? "authorization"
          : req.headers.get("apikey")
          ? "apikey"
          : "none",
      });

      return new Response(
        JSON.stringify({ success: false, error: "Token inválido" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const body: CallbackPayload = await req.json();

    if (!body.action || !body.data) {
      return new Response(
        JSON.stringify({ success: false, error: "action e data são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let result: Record<string, unknown> = {};

    switch (body.action) {
      // ── MARCAR PARCELA COMO PAGA ──
      case "marcar_pago": {
        const { cobranca_id, data_vencimento, cpf } = body.data as {
          cobranca_id?: string;
          data_vencimento?: string;
          cpf?: string;
        };

        if (!cobranca_id && !cpf) {
          return new Response(
            JSON.stringify({ success: false, error: "cobranca_id ou cpf é obrigatório" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        let targetCobrancaId = cobranca_id;

        // Se veio CPF, busca a cobrança do cliente
        if (!targetCobrancaId && cpf) {
          const cleanCpf = cpf.replace(/\D/g, "");
          const { data: cliente } = await supabase
            .from("clientes")
            .select("id")
            .or(`cpf.eq.${cleanCpf},cpf.eq.${cpf}`)
            .maybeSingle();

          if (cliente) {
            const { data: cobranca } = await supabase
              .from("cobrancas")
              .select("id")
              .eq("cliente_id", cliente.id)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();

            if (cobranca) targetCobrancaId = cobranca.id;
          }
        }

        if (!targetCobrancaId) {
          return new Response(
            JSON.stringify({ success: false, error: "Cobrança não encontrada" }),
            { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Busca parcela pendente
        let query = supabase
          .from("cobranca_pagamentos")
          .select("*")
          .eq("cobranca_id", targetCobrancaId)
          .in("status", ["a_pagar", "pendente"]);

        if (data_vencimento) {
          query = query.eq("data_vencimento", data_vencimento);
        }

        const { data: parcelas } = await query.order("data_vencimento", { ascending: true }).limit(1);

        if (!parcelas || parcelas.length === 0) {
          return new Response(
            JSON.stringify({ success: false, error: "Nenhuma parcela pendente encontrada" }),
            { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const parcela = parcelas[0];

        const { error: updateError } = await supabase
          .from("cobranca_pagamentos")
          .update({
            status: "pago",
            pago_em: new Date().toISOString(),
            tipo_pagamento: "n8n",
          })
          .eq("id", parcela.id);

        if (updateError) throw updateError;

        result = { parcela_id: parcela.id, data_vencimento: parcela.data_vencimento, status: "pago" };

        // Audit log
        await supabase.from("audit_log").insert({
          tabela: "cobranca_pagamentos",
          acao: "n8n_marcar_pago",
          registro_id: parcela.id,
          detalhes: { cobranca_id: targetCobrancaId, via: "n8n-callback" },
        });

        break;
      }

      // ── ENVIAR NOTIFICAÇÃO ──
      case "enviar_notificacao": {
        const { user_id, titulo, mensagem, tipo, dados } = body.data as {
          user_id?: string;
          titulo: string;
          mensagem: string;
          tipo?: string;
          dados?: Record<string, unknown>;
        };

        if (!titulo || !mensagem) {
          return new Response(
            JSON.stringify({ success: false, error: "titulo e mensagem são obrigatórios" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Se não tiver user_id, envia para todos os admins
        let targetUserIds: string[] = [];

        if (user_id) {
          targetUserIds = [user_id];
        } else {
          const { data: admins } = await supabase
            .from("user_roles")
            .select("user_id")
            .eq("role", "admin");
          targetUserIds = (admins || []).map((a) => a.user_id);
        }

        const notifications = targetUserIds.map((uid) => ({
          user_id: uid,
          titulo,
          mensagem,
          tipo: tipo || "n8n",
          dados: dados || null,
        }));

        const { error: notifError } = await supabase.from("notificacoes").insert(notifications);
        if (notifError) throw notifError;

        result = { enviadas: targetUserIds.length, user_ids: targetUserIds };
        break;
      }

      // ── ATUALIZAR DADOS DO CLIENTE ──
      case "atualizar_cliente": {
        const { cliente_id, cpf, ...updateFields } = body.data as {
          cliente_id?: string;
          cpf?: string;
          [key: string]: unknown;
        };

        if (!cliente_id && !cpf) {
          return new Response(
            JSON.stringify({ success: false, error: "cliente_id ou cpf é obrigatório" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        let targetId = cliente_id;

        if (!targetId && cpf) {
          const cleanCpf = (cpf as string).replace(/\D/g, "");
          const { data: cliente } = await supabase
            .from("clientes")
            .select("id")
            .or(`cpf.eq.${cleanCpf},cpf.eq.${cpf}`)
            .maybeSingle();
          targetId = cliente?.id;
        }

        if (!targetId) {
          return new Response(
            JSON.stringify({ success: false, error: "Cliente não encontrado" }),
            { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Campos permitidos para atualização
        const allowedFields = [
          "nome", "telefone", "email", "endereco", "cep", "bairro",
          "cidade", "uf", "complemento", "observacoes",
        ];

        const safeUpdate: Record<string, unknown> = {};
        for (const key of allowedFields) {
          if (updateFields[key] !== undefined) {
            safeUpdate[key] = updateFields[key];
          }
        }

        if (Object.keys(safeUpdate).length === 0) {
          return new Response(
            JSON.stringify({ success: false, error: "Nenhum campo válido para atualizar" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const { error: updateError } = await supabase
          .from("clientes")
          .update(safeUpdate)
          .eq("id", targetId);

        if (updateError) throw updateError;

        result = { cliente_id: targetId, campos_atualizados: Object.keys(safeUpdate) };

        await supabase.from("audit_log").insert({
          tabela: "clientes",
          acao: "n8n_atualizar_cliente",
          registro_id: targetId,
          detalhes: { campos: Object.keys(safeUpdate), via: "n8n-callback" },
        });

        break;
      }

      // ── CRIAR COBRANÇA ──
      case "criar_cobranca": {
        const { cliente_id, cpf, valor_parcela, data_inicio, data_fim, frequencia, observacoes } =
          body.data as {
            cliente_id?: string;
            cpf?: string;
            valor_parcela: number;
            data_inicio: string;
            data_fim: string;
            frequencia?: string;
            observacoes?: string;
          };

        if (!valor_parcela || !data_inicio || !data_fim) {
          return new Response(
            JSON.stringify({ success: false, error: "valor_parcela, data_inicio e data_fim são obrigatórios" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        let targetClienteId = cliente_id;
        let clienteNome = "Cliente n8n";

        if (!targetClienteId && cpf) {
          const cleanCpf = (cpf as string).replace(/\D/g, "");
          const { data: cliente } = await supabase
            .from("clientes")
            .select("id, nome")
            .or(`cpf.eq.${cleanCpf},cpf.eq.${cpf}`)
            .maybeSingle();
          if (cliente) {
            targetClienteId = cliente.id;
            clienteNome = cliente.nome;
          }
        }

        if (!targetClienteId) {
          return new Response(
            JSON.stringify({ success: false, error: "Cliente não encontrado" }),
            { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Busca admin para ser o criador
        const { data: admin } = await supabase
          .from("user_roles")
          .select("user_id")
          .eq("role", "admin")
          .limit(1)
          .maybeSingle();

        const { data: cobranca, error: cobError } = await supabase
          .from("cobrancas")
          .insert({
            cliente_id: targetClienteId,
            cliente_nome: clienteNome,
            valor_parcela,
            data_inicio,
            data_fim,
            frequencia: frequencia || "mes",
            observacoes: observacoes || "Criado via n8n",
            criado_por: admin?.user_id || targetClienteId,
          })
          .select()
          .single();

        if (cobError) throw cobError;

        result = { cobranca_id: cobranca.id, cliente_nome: clienteNome };
        break;
      }

      // ── HANDOVER: sinalizar fim do fluxo financeiro ──
      case "handover": {
        const { phone, status: handoverStatus, context_id: ctxId } = body.data as {
          phone?: string;
          status?: string;
          context_id?: string;
        };

        const webhookUrl = Deno.env.get("N8N_WEBHOOK_URL");
        if (webhookUrl && phone) {
          await fetch(webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              source: "lovable_handover",
              status: handoverStatus || "financeiro_concluido",
              phone,
              context_id: ctxId || null,
              timestamp: new Date().toISOString(),
            }),
          }).catch((e) => console.warn("[n8n-callback] handover notify error:", e));
        }

        result = { status: handoverStatus || "financeiro_concluido", phone };
        break;
      }

      default:
        return new Response(
          JSON.stringify({
            success: false,
            error: `Ação '${body.action}' não reconhecida. Ações disponíveis: marcar_pago, enviar_notificacao, atualizar_cliente, criar_cobranca, handover`,
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    return new Response(
      JSON.stringify({ success: true, action: body.action, result }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[n8n-callback] Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

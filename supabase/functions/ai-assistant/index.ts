import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const actionTools = [
  {
    type: "function",
    function: {
      name: "update_payment_status",
      description: "Marcar parcela como paga, isenta ou a_pagar",
      parameters: {
        type: "object",
        properties: {
          payment_id: { type: "string", description: "ID do pagamento (cobranca_pagamentos)" },
          status: { type: "string", enum: ["pago", "isento", "a_pagar"], description: "Novo status" },
        },
        required: ["payment_id", "status"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_client",
      description: "Atualizar dados de um cliente (nome, telefone, cpf, endereco, bairro, cidade, uf, cep, email, observacoes etc)",
      parameters: {
        type: "object",
        properties: {
          client_id: { type: "string", description: "ID do cliente" },
          fields: {
            type: "object",
            description: "Campos a atualizar: nome, telefone, cpf, endereco, bairro, cidade, uf, cep, email, observacoes, data_nascimento, rg, nome_pai, nome_mae, estado_civil, naturalidade",
          },
        },
        required: ["client_id", "fields"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_product",
      description: "Atualizar dados de um produto (nome, preço, estoque, categoria)",
      parameters: {
        type: "object",
        properties: {
          product_id: { type: "string", description: "ID do produto" },
          fields: {
            type: "object",
            description: "Campos: nome, preco_venda, preco_custo, preco_pix, preco_credito, preco_boleto, preco_carne, estoque_atual, estoque_minimo, categoria, subcategoria",
          },
        },
        required: ["product_id", "fields"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_sale",
      description: "Atualizar dados de uma venda (valor_total, valor_entrada, valor_parcela, num_parcelas, status, observacoes, forma_pagamento)",
      parameters: {
        type: "object",
        properties: {
          sale_id: { type: "string", description: "ID da venda" },
          fields: {
            type: "object",
            description: "Campos: valor_total, valor_entrada, valor_parcela, num_parcelas, status, observacoes, forma_pagamento, data_inicio_pagamento, frequencia_parcela",
          },
        },
        required: ["sale_id", "fields"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_cobranca",
      description: "Atualizar dados de uma cobrança (valor_parcela, frequencia, data_inicio, data_fim, observacoes)",
      parameters: {
        type: "object",
        properties: {
          cobranca_id: { type: "string", description: "ID da cobrança" },
          fields: {
            type: "object",
            description: "Campos: valor_parcela, frequencia, data_inicio, data_fim, observacoes, cliente_nome",
          },
        },
        required: ["cobranca_id", "fields"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_payment_record",
      description: "Criar novo registro de pagamento para uma cobrança",
      parameters: {
        type: "object",
        properties: {
          cobranca_id: { type: "string" },
          data_vencimento: { type: "string", description: "YYYY-MM-DD" },
          status: { type: "string", enum: ["pago", "a_pagar", "isento"], default: "a_pagar" },
        },
        required: ["cobranca_id", "data_vencimento"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_payment_record",
      description: "Excluir um registro de pagamento específico",
      parameters: {
        type: "object",
        properties: {
          payment_id: { type: "string", description: "ID do pagamento" },
        },
        required: ["payment_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "send_whatsapp",
      description: "Enviar mensagem WhatsApp para um cliente. Pode enviar cobrança automática (com dados de fatura) ou mensagem livre.",
      parameters: {
        type: "object",
        properties: {
          telefone: { type: "string", description: "Telefone do cliente com DDD" },
          mensagem: { type: "string", description: "Mensagem livre (opcional se dados de cobrança forem fornecidos)" },
          cobranca_id: { type: "string", description: "ID da cobrança (para cobrança automática)" },
          cliente_id: { type: "string", description: "ID do cliente" },
          cliente_nome: { type: "string", description: "Nome do cliente" },
          cpf: { type: "string", description: "CPF do cliente" },
          valor: { type: "number", description: "Valor da parcela" },
          data_vencimento: { type: "string", description: "Data de vencimento YYYY-MM-DD" },
          status_parcela: { type: "string", description: "Status da parcela" },
        },
        required: ["telefone"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "trigger_payment_reminders",
      description: "Disparar manualmente a automação de lembretes de pagamento (notificações + WhatsApp para cobranças do dia/amanhã)",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "send_notification",
      description: "Enviar notificação interna para um ou todos os usuários",
      parameters: {
        type: "object",
        properties: {
          user_id: { type: "string", description: "ID do usuário (ou 'all_admins' para todos os admins)" },
          titulo: { type: "string", description: "Título da notificação" },
          mensagem: { type: "string", description: "Corpo da notificação" },
          tipo: { type: "string", description: "Tipo: lembrete, alerta, info", default: "info" },
        },
        required: ["titulo", "mensagem"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "view_whatsapp_history",
      description: "Ver histórico de envios WhatsApp de um cliente ou período",
      parameters: {
        type: "object",
        properties: {
          cpf: { type: "string", description: "CPF do cliente (opcional)" },
          dias: { type: "number", description: "Últimos N dias (padrão 7)", default: 7 },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_cobranca",
      description: "Criar nova cobrança para um cliente com parcelas automáticas",
      parameters: {
        type: "object",
        properties: {
          cliente_id: { type: "string", description: "ID do cliente" },
          cliente_nome: { type: "string", description: "Nome do cliente" },
          valor_parcela: { type: "number", description: "Valor de cada parcela" },
          data_inicio: { type: "string", description: "Data de início YYYY-MM-DD" },
          data_fim: { type: "string", description: "Data de fim YYYY-MM-DD" },
          frequencia: { type: "string", enum: ["semana", "quinzena", "mes"], default: "mes" },
          observacoes: { type: "string", description: "Observações opcionais" },
        },
        required: ["cliente_id", "cliente_nome", "valor_parcela", "data_inicio", "data_fim"],
      },
    },
  },
];

// Allowed fields per table for security
const ALLOWED_FIELDS: Record<string, string[]> = {
  clientes: ["nome", "telefone", "cpf", "endereco", "bairro", "cidade", "uf", "cep", "email", "observacoes", "data_nascimento", "rg", "rg_emissor", "rg_data_emissao", "nome_pai", "nome_mae", "estado_civil", "naturalidade", "complemento", "tipo", "inscricao_estadual"],
  produtos: ["nome", "preco_venda", "preco_custo", "preco_pix", "preco_credito", "preco_boleto", "preco_carne", "estoque_atual", "estoque_minimo", "categoria", "subcategoria", "codigo_barras"],
  vendas: ["valor_total", "valor_entrada", "valor_parcela", "num_parcelas", "status", "observacoes", "forma_pagamento", "data_inicio_pagamento", "frequencia_parcela", "cliente_nome", "cliente_cpf", "cliente_telefone"],
  cobrancas: ["valor_parcela", "frequencia", "data_inicio", "data_fim", "observacoes", "cliente_nome"],
};

function sanitizeFields(table: string, fields: Record<string, any>): Record<string, any> {
  const allowed = ALLOWED_FIELDS[table] || [];
  const clean: Record<string, any> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (allowed.includes(k) && v !== null && v !== undefined && v !== "") {
      clean[k] = v;
    }
  }
  return clean;
}

async function executeAction(sb: any, action: string, args: any): Promise<string> {
  switch (action) {
    case "update_payment_status": {
      const update: any = { status: args.status };
      if (args.status === "pago") {
        update.pago_em = new Date().toISOString();
      } else {
        update.pago_em = null;
        update.pago_por = null;
      }
      const { error } = await sb.from("cobranca_pagamentos").update(update).eq("id", args.payment_id);
      if (error) throw error;
      return `✅ Pagamento atualizado para "${args.status}"`;
    }
    case "update_client": {
      const clean = sanitizeFields("clientes", args.fields);
      if (Object.keys(clean).length === 0) return "⚠️ Nenhum campo válido para atualizar";
      const { error } = await sb.from("clientes").update(clean).eq("id", args.client_id);
      if (error) throw error;
      return `✅ Cliente atualizado: ${Object.keys(clean).join(", ")}`;
    }
    case "update_product": {
      const clean = sanitizeFields("produtos", args.fields);
      if (Object.keys(clean).length === 0) return "⚠️ Nenhum campo válido para atualizar";
      const { error } = await sb.from("produtos").update(clean).eq("id", args.product_id);
      if (error) throw error;
      return `✅ Produto atualizado: ${Object.keys(clean).join(", ")}`;
    }
    case "update_sale": {
      const clean = sanitizeFields("vendas", args.fields);
      if (Object.keys(clean).length === 0) return "⚠️ Nenhum campo válido para atualizar";
      const { error } = await sb.from("vendas").update(clean).eq("id", args.sale_id);
      if (error) throw error;
      return `✅ Venda atualizada: ${Object.keys(clean).join(", ")}`;
    }
    case "update_cobranca": {
      const clean = sanitizeFields("cobrancas", args.fields);
      if (Object.keys(clean).length === 0) return "⚠️ Nenhum campo válido para atualizar";
      const { error } = await sb.from("cobrancas").update(clean).eq("id", args.cobranca_id);
      if (error) throw error;
      return `✅ Cobrança atualizada: ${Object.keys(clean).join(", ")}`;
    }
    case "create_payment_record": {
      const insert: any = {
        cobranca_id: args.cobranca_id,
        data_vencimento: args.data_vencimento,
        status: args.status || "a_pagar",
      };
      if (insert.status === "pago") insert.pago_em = new Date().toISOString();
      const { error } = await sb.from("cobranca_pagamentos").insert(insert);
      if (error) throw error;
      return `✅ Parcela criada para ${args.data_vencimento} com status "${insert.status}"`;
    }
    case "send_whatsapp": {
      const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
      const body: any = { telefone: args.telefone, instancia: "Veloop" };
      if (args.mensagem) body.mensagem = args.mensagem;
      if (args.cobranca_id) {
        body.cobranca_id = args.cobranca_id;
        body.cliente_id = args.cliente_id;
        body.cliente_nome = args.cliente_nome;
        body.cpf = args.cpf;
        body.valor = args.valor;
        body.data_vencimento = args.data_vencimento;
        body.status_parcela = args.status_parcela;
      }
      const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
      const res = await fetch(`${SUPABASE_URL}/functions/v1/send-whatsapp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.duplicado) return "⚠️ Mensagem já foi enviada para este cliente hoje (bloqueio anti-duplicidade)";
      if (!data.success) return `❌ Falha no envio: ${data.error || "Erro desconhecido"}`;
      return `✅ WhatsApp enviado com sucesso para ${args.telefone}`;
    }
    case "trigger_payment_reminders": {
      const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
      const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
      const res = await fetch(`${SUPABASE_URL}/functions/v1/check-payment-reminders`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.skipped) return `⏳ ${data.reason}`;
      return `✅ Automação executada!\n- WhatsApp enviados: ${data.whatsapp_sent || 0}\n- Notificações criadas: ${data.notifications_created || 0}\n- Duplicados ignorados: ${data.skipped_duplicates || 0}`;
    }
    case "send_notification": {
      const targetUsers: string[] = [];
      if (args.user_id === "all_admins" || !args.user_id) {
        const { data: adminRoles } = await sb.from("user_roles").select("user_id").eq("role", "admin");
        targetUsers.push(...(adminRoles || []).map((r: any) => r.user_id));
      } else {
        targetUsers.push(args.user_id);
      }
      for (const uid of targetUsers) {
        await sb.from("notificacoes").insert({
          user_id: uid,
          titulo: args.titulo,
          mensagem: args.mensagem,
          tipo: args.tipo || "info",
        });
      }
      return `✅ Notificação enviada para ${targetUsers.length} usuário(s)`;
    }
    case "view_whatsapp_history": {
      const dias = args.dias || 7;
      const since = new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      let q = sb.from("envio_cobranca").select("*").gte("data_envio", since).order("data_envio", { ascending: false }).limit(50);
      if (args.cpf) q = q.eq("cpf", args.cpf);
      const { data, error } = await q;
      if (error) throw error;
      if (!data || data.length === 0) return "📭 Nenhum envio encontrado no período";
      const lines = data.map((e: any) => `- ${e.data_envio} | ${e.cpf} | ${e.tipo_envio} | ${e.enviado_com_sucesso ? "✅" : "❌"}`);
      return `📋 **Histórico de envios** (últimos ${dias} dias):\n${lines.join("\n")}`;
    }
    case "create_cobranca": {
      // Get admin user id for criado_por
      const { data: adminRoles } = await sb.from("user_roles").select("user_id").eq("role", "admin").limit(1);
      const adminId = adminRoles?.[0]?.user_id;
      if (!adminId) return "❌ Nenhum admin encontrado";
      
      const { data: newCob, error } = await sb.from("cobrancas").insert({
        cliente_id: args.cliente_id,
        cliente_nome: args.cliente_nome,
        valor_parcela: args.valor_parcela,
        data_inicio: args.data_inicio,
        data_fim: args.data_fim,
        frequencia: args.frequencia || "mes",
        observacoes: args.observacoes || null,
        criado_por: adminId,
      }).select().single();
      if (error) throw error;

      // Generate payment records
      const start = new Date(`${args.data_inicio}T00:00:00Z`);
      const end = new Date(`${args.data_fim}T00:00:00Z`);
      const payments: any[] = [];
      let current = new Date(start);
      while (current <= end) {
        payments.push({
          cobranca_id: newCob.id,
          data_vencimento: current.toISOString().slice(0, 10),
          status: "a_pagar",
        });
        if (args.frequencia === "semana") current = new Date(current.getTime() + 7 * 86400000);
        else if (args.frequencia === "quinzena") current = new Date(current.getTime() + 15 * 86400000);
        else {
          current.setUTCMonth(current.getUTCMonth() + 1);
        }
      }
      if (payments.length > 0) {
        await sb.from("cobranca_pagamentos").insert(payments);
      }
      return `✅ Cobrança criada para ${args.cliente_nome} com ${payments.length} parcelas de R$ ${args.valor_parcela}`;
    }
    default:
      return "⚠️ Ação não reconhecida";
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY não configurada");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { query, type, confirm_action } = await req.json();

    // If confirming a previously proposed action, execute it directly
    if (confirm_action) {
      const { action, args } = confirm_action;
      const result = await executeAction(sb, action, args);
      return new Response(JSON.stringify({ response: result, action_executed: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!query && type !== "proactive_tips") throw new Error("Query não fornecida");

    // Gather context
    const [clientesRes, vendasRes, cobrancasRes, pagamentosRes, produtosRes] = await Promise.all([
      sb.from("clientes").select("id, nome, cpf, telefone, endereco, cidade, uf").limit(200),
      sb.from("vendas").select("id, cliente_nome, cliente_cpf, valor_total, valor_entrada, valor_parcela, num_parcelas, forma_pagamento, status, data_inicio_pagamento, created_at").order("created_at", { ascending: false }).limit(100),
      sb.from("cobrancas").select("id, cliente_nome, valor_parcela, data_inicio, data_fim, frequencia, cliente_id").limit(100),
      sb.from("cobranca_pagamentos").select("id, cobranca_id, data_vencimento, status, pago_em").limit(500),
      sb.from("produtos").select("id, nome, preco_venda, preco_custo, estoque_atual, categoria").limit(200),
    ]);

    const context = {
      clientes: clientesRes.data || [],
      vendas: vendasRes.data || [],
      cobrancas: cobrancasRes.data || [],
      pagamentos: pagamentosRes.data || [],
      produtos: produtosRes.data || [],
    };

    const systemPrompt = `Você é o assistente IA COMPLETO do sistema Veloop com PODERES DE MODIFICAÇÃO e AUTOMAÇÃO.
Você pode CONSULTAR, MODIFICAR dados e EXECUTAR AUTOMAÇÕES do sistema.

AUTOMAÇÕES DISPONÍVEIS:
1. send_whatsapp - Enviar WhatsApp (cobrança automática com IA ou mensagem livre)
2. trigger_payment_reminders - Disparar lembretes de pagamento (notif + WhatsApp)
3. send_notification - Enviar notificação interna
4. view_whatsapp_history - Ver histórico de envios WhatsApp
5. create_cobranca - Criar cobrança com parcelas automáticas
6. update_payment_status / update_client / update_product / update_sale / update_cobranca
7. create_payment_record / delete_payment_record

DADOS ATUAIS:
- ${context.clientes.length} clientes | ${context.vendas.length} vendas | ${context.cobrancas.length} cobranças | ${context.pagamentos.length} pagamentos | ${context.produtos.length} produtos

CLIENTES: ${JSON.stringify(context.clientes.slice(0, 50))}
VENDAS: ${JSON.stringify(context.vendas.slice(0, 30))}
COBRANÇAS: ${JSON.stringify(context.cobrancas.slice(0, 30))}
PAGAMENTOS: ${JSON.stringify(context.pagamentos.slice(0, 100))}
PRODUTOS: ${JSON.stringify(context.produtos.slice(0, 50))}

REGRAS CRÍTICAS:
- Responda SEMPRE em português brasileiro
- Se o usuário pedir para MODIFICAR ou EXECUTAR algo, use a ferramenta apropriada
- SEMPRE confirme o que vai fazer antes de executar, descrevendo a ação
- Seja preciso com IDs - busque o ID correto nos dados antes de agir
- Formate valores como R$ X.XXX,XX e datas como DD/MM/AAAA
- Se não encontrar o registro, informe claramente
- Para consultas simples, responda diretamente SEM usar ferramentas
- Dê dicas proativas quando identificar problemas
- Para WhatsApp: busque o telefone e CPF do cliente nos dados antes de enviar`;

    let userPrompt = query;
    if (type === "proactive_tips") {
      userPrompt = `Analise os dados e forneça 2-3 dicas úteis. Foque em: pagamentos atrasados, inconsistências, alertas. Seja breve. Use emojis.`;
    }

    const body: any = {
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    };

    // Add tools for action requests (not for tips)
    if (type !== "proactive_tips") {
      body.tools = actionTools;
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Limite de requisições excedido." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos insuficientes." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI error:", response.status, t);
      throw new Error("Erro na IA");
    }

    const result = await response.json();
    const message = result.choices?.[0]?.message;

    // Check if AI wants to call a tool (action)
    if (message?.tool_calls && message.tool_calls.length > 0) {
      const toolCall = message.tool_calls[0];
      const actionName = toolCall.function.name;
      const actionArgs = JSON.parse(toolCall.function.arguments);

      // Build a human-readable description
      let description = message.content || "";
      if (!description) {
        description = describeAction(actionName, actionArgs, context);
      }

      return new Response(JSON.stringify({
        response: description,
        pending_action: {
          action: actionName,
          args: actionArgs,
          description: description,
        },
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ response: message?.content || "Sem resposta" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-assistant error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function describeAction(action: string, args: any, ctx: any): string {
  switch (action) {
    case "update_payment_status":
      return `Vou alterar o status do pagamento para **"${args.status}"**. Deseja confirmar?`;
    case "update_client": {
      const fields = Object.entries(args.fields || {}).map(([k, v]) => `${k}: ${v}`).join(", ");
      return `Vou atualizar o cliente com: **${fields}**. Deseja confirmar?`;
    }
    case "update_product": {
      const fields = Object.entries(args.fields || {}).map(([k, v]) => `${k}: ${v}`).join(", ");
      return `Vou atualizar o produto com: **${fields}**. Deseja confirmar?`;
    }
    case "update_sale": {
      const fields = Object.entries(args.fields || {}).map(([k, v]) => `${k}: ${v}`).join(", ");
      return `Vou atualizar a venda com: **${fields}**. Deseja confirmar?`;
    }
    case "update_cobranca": {
      const fields = Object.entries(args.fields || {}).map(([k, v]) => `${k}: ${v}`).join(", ");
      return `Vou atualizar a cobrança com: **${fields}**. Deseja confirmar?`;
    }
    case "create_payment_record":
      return `Vou criar uma parcela em **${args.data_vencimento}** com status **"${args.status || "a_pagar"}"**. Deseja confirmar?`;
    case "delete_payment_record":
      return `Vou **excluir** o registro de pagamento. Deseja confirmar?`;
    case "send_whatsapp":
      return `Vou enviar **WhatsApp** para **${args.telefone}**${args.cliente_nome ? ` (${args.cliente_nome})` : ""}. Deseja confirmar?`;
    case "trigger_payment_reminders":
      return `Vou **disparar a automação de lembretes** (WhatsApp + notificações para cobranças do dia/amanhã). Deseja confirmar?`;
    case "send_notification":
      return `Vou enviar **notificação**: "${args.titulo}" — ${args.mensagem}. Deseja confirmar?`;
    case "view_whatsapp_history":
      return `Consultando histórico de envios WhatsApp...`;
    case "create_cobranca":
      return `Vou criar uma **cobrança** para **${args.cliente_nome}** com parcelas de **R$ ${args.valor_parcela}** de ${args.data_inicio} a ${args.data_fim}. Deseja confirmar?`;
    default:
      return "Ação não reconhecida.";
  }
}

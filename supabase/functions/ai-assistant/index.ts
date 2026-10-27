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
      description: "Atualizar dados de um cliente",
      parameters: {
        type: "object",
        properties: {
          client_id: { type: "string", description: "ID do cliente" },
          fields: { type: "object", description: "Campos a atualizar" },
        },
        required: ["client_id", "fields"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_client",
      description: "Excluir um cliente permanentemente",
      parameters: {
        type: "object",
        properties: {
          client_id: { type: "string", description: "ID do cliente" },
        },
        required: ["client_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_product",
      description: "Atualizar dados de um produto",
      parameters: {
        type: "object",
        properties: {
          product_id: { type: "string", description: "ID do produto" },
          fields: { type: "object", description: "Campos a atualizar" },
        },
        required: ["product_id", "fields"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_product",
      description: "Excluir um produto permanentemente",
      parameters: {
        type: "object",
        properties: {
          product_id: { type: "string", description: "ID do produto" },
        },
        required: ["product_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_sale",
      description: "Atualizar dados de uma venda",
      parameters: {
        type: "object",
        properties: {
          sale_id: { type: "string", description: "ID da venda" },
          fields: { type: "object", description: "Campos a atualizar" },
        },
        required: ["sale_id", "fields"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_sale",
      description: "Excluir uma venda e seus itens permanentemente",
      parameters: {
        type: "object",
        properties: {
          sale_id: { type: "string", description: "ID da venda" },
        },
        required: ["sale_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_cobranca",
      description: "Atualizar dados de uma cobrança",
      parameters: {
        type: "object",
        properties: {
          cobranca_id: { type: "string", description: "ID da cobrança" },
          fields: { type: "object", description: "Campos a atualizar" },
        },
        required: ["cobranca_id", "fields"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_cobranca",
      description: "Excluir uma cobrança e seus pagamentos permanentemente",
      parameters: {
        type: "object",
        properties: {
          cobranca_id: { type: "string", description: "ID da cobrança" },
        },
        required: ["cobranca_id"],
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
      description: "Enviar mensagem WhatsApp para um cliente via Evolution API. Busca automaticamente o telefone do cliente se não informado.",
      parameters: {
        type: "object",
        properties: {
          cliente_id: { type: "string", description: "ID do cliente (busca telefone automaticamente)" },
          telefone: { type: "string", description: "Telefone do destinatário com DDD (se não informar cliente_id)" },
          mensagem: { type: "string", description: "Texto da mensagem a enviar" },
          nome_cliente: { type: "string", description: "Nome do cliente (para registro)" },
        },
        required: ["mensagem"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "send_webhook",
      description: "Enviar dados de cobrança/venda via webhook para o n8n",
      parameters: {
        type: "object",
        properties: {
          nome_cliente: { type: "string", description: "Nome do cliente" },
          telefone: { type: "string", description: "Telefone do cliente com DDD" },
          valor_transacao: { type: "number", description: "Valor da transação" },
          data_vencimento: { type: "string", description: "Data de vencimento" },
          tipo: { type: "string", enum: ["entrada", "carne", "cobranca"], description: "Tipo da transação" },
          id_venda: { type: "string", description: "ID da venda (opcional)" },
          cobranca_id: { type: "string" },
          cliente_id: { type: "string" },
          cpf: { type: "string" },
          status_parcela: { type: "string" },
        },
        required: ["nome_cliente", "telefone", "valor_transacao", "tipo"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "trigger_payment_reminders",
      description: "Disparar manualmente a automação de lembretes de pagamento",
      parameters: { type: "object", properties: {}, required: [] },
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
          user_id: { type: "string", description: "ID do usuário ou 'all_admins'" },
          titulo: { type: "string" },
          mensagem: { type: "string" },
          tipo: { type: "string", default: "info" },
        },
        required: ["titulo", "mensagem"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "view_whatsapp_history",
      description: "Ver histórico de envios WhatsApp",
      parameters: {
        type: "object",
        properties: {
          cpf: { type: "string" },
          dias: { type: "number", default: 7 },
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
          cliente_id: { type: "string" },
          cliente_nome: { type: "string" },
          valor_parcela: { type: "number" },
          data_inicio: { type: "string" },
          data_fim: { type: "string" },
          frequencia: { type: "string", enum: ["semana", "quinzena", "mes"], default: "mes" },
          observacoes: { type: "string" },
        },
        required: ["cliente_id", "cliente_nome", "valor_parcela", "data_inicio", "data_fim"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_dispositivo",
      description: "Excluir um dispositivo permanentemente",
      parameters: {
        type: "object",
        properties: {
          dispositivo_id: { type: "string", description: "ID do dispositivo" },
        },
        required: ["dispositivo_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_dispositivo",
      description: "Atualizar dados de um dispositivo (status_seguranca, modelo, observacoes, etc)",
      parameters: {
        type: "object",
        properties: {
          dispositivo_id: { type: "string" },
          fields: { type: "object", description: "Campos: status_seguranca, modelo, nome_dispositivo, observacoes, memoria, imei2, serial_number" },
        },
        required: ["dispositivo_id", "fields"],
      },
    },
  },
];

const ALLOWED_FIELDS: Record<string, string[]> = {
  clientes: ["nome", "telefone", "cpf", "endereco", "bairro", "cidade", "uf", "cep", "email", "observacoes", "data_nascimento", "rg", "rg_emissor", "rg_data_emissao", "nome_pai", "nome_mae", "estado_civil", "naturalidade", "complemento", "tipo", "inscricao_estadual"],
  produtos: ["nome", "preco_venda", "preco_custo", "preco_pix", "preco_credito", "preco_boleto", "preco_carne", "estoque_atual", "estoque_minimo", "categoria", "subcategoria", "codigo_barras"],
  vendas: ["valor_total", "valor_entrada", "valor_parcela", "num_parcelas", "status", "observacoes", "forma_pagamento", "data_inicio_pagamento", "frequencia_parcela", "cliente_nome", "cliente_cpf", "cliente_telefone"],
  cobrancas: ["valor_parcela", "frequencia", "data_inicio", "data_fim", "observacoes", "cliente_nome"],
  dispositivos: ["status_seguranca", "modelo", "nome_dispositivo", "observacoes", "memoria", "imei2", "serial_number", "imei_serial"],
};

function base64UrlEncode(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function base64UrlDecode(value: string): string {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function signActionPayload(payload: Record<string, unknown>, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(encodedPayload));
  const bytes = new Uint8Array(signature);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const encodedSignature = btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  return encodedPayload + "." + encodedSignature;
}

async function verifyActionToken(token: string, secret: string): Promise<Record<string, unknown> | null> {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [encodedPayload, encodedSignature] = parts;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const base64 = encodedSignature.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const signatureBytes = Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
  const valid = await crypto.subtle.verify("HMAC", key, signatureBytes, new TextEncoder().encode(encodedPayload));
  if (!valid) return null;
  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload));
    return payload && typeof payload === "object" && !Array.isArray(payload) ? payload : null;
  } catch { return null; }
}

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

async function executeAction(sb: any, action: string, args: any, actorId: string): Promise<string> {
  switch (action) {
    case "update_payment_status": {
      const update: any = { status: args.status };
      if (args.status === "pago") {
        update.pago_em = new Date().toISOString();
        update.pago_por = actorId;
      } else {
        update.pago_em = null;
        update.pago_por = null;
      }
      const { data, error } = await sb
        .from("cobranca_pagamentos")
        .update(update)
        .eq("id", args.payment_id)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!data) return "❌ Parcela não encontrada; nenhum pagamento foi alterado.";
      return `✅ Pagamento atualizado para "${args.status}"`;
    }
    case "update_client": {
      const clean = sanitizeFields("clientes", args.fields);
      if (Object.keys(clean).length === 0) return "⚠️ Nenhum campo válido para atualizar";
      const { error } = await sb.from("clientes").update(clean).eq("id", args.client_id);
      if (error) throw error;
      return `✅ Cliente atualizado: ${Object.keys(clean).join(", ")}`;
    }
    case "delete_client": {
      const { error } = await sb.from("clientes").delete().eq("id", args.client_id);
      if (error) throw error;
      return `✅ Cliente excluído permanentemente`;
    }
    case "update_product": {
      const clean = sanitizeFields("produtos", args.fields);
      if (Object.keys(clean).length === 0) return "⚠️ Nenhum campo válido para atualizar";
      const { error } = await sb.from("produtos").update(clean).eq("id", args.product_id);
      if (error) throw error;
      return `✅ Produto atualizado: ${Object.keys(clean).join(", ")}`;
    }
    case "delete_product": {
      const { error } = await sb.from("produtos").delete().eq("id", args.product_id);
      if (error) throw error;
      return `✅ Produto excluído permanentemente`;
    }
    case "update_sale": {
      const clean = sanitizeFields("vendas", args.fields);
      if (Object.keys(clean).length === 0) return "⚠️ Nenhum campo válido para atualizar";
      const { error } = await sb.from("vendas").update(clean).eq("id", args.sale_id);
      if (error) throw error;
      return `✅ Venda atualizada: ${Object.keys(clean).join(", ")}`;
    }
    case "delete_sale": {
      const { error: itemsError } = await sb.from("venda_itens").delete().eq("venda_id", args.sale_id);
      if (itemsError) throw itemsError;
      const { error } = await sb.from("vendas").delete().eq("id", args.sale_id);
      if (error) throw error;
      return `✅ Venda e seus itens excluídos permanentemente`;
    }
    case "update_cobranca": {
      const clean = sanitizeFields("cobrancas", args.fields);
      if (Object.keys(clean).length === 0) return "⚠️ Nenhum campo válido para atualizar";
      const { error } = await sb.from("cobrancas").update(clean).eq("id", args.cobranca_id);
      if (error) throw error;
      return `✅ Cobrança atualizada: ${Object.keys(clean).join(", ")}`;
    }
    case "delete_cobranca": {
      const { error: paymentsError } = await sb.from("cobranca_pagamentos").delete().eq("cobranca_id", args.cobranca_id);
      if (paymentsError) throw paymentsError;
      const { error } = await sb.from("cobrancas").delete().eq("id", args.cobranca_id);
      if (error) throw error;
      return `✅ Cobrança e seus pagamentos excluídos permanentemente`;
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
    case "delete_payment_record": {
      const { error } = await sb.from("cobranca_pagamentos").delete().eq("id", args.payment_id);
      if (error) throw error;
      return `✅ Registro de pagamento excluído`;
    }
    case "send_whatsapp": {
      let telefone = args.telefone;
      let nomeCliente = args.nome_cliente || "";

      // If cliente_id provided, fetch phone from DB
      if (args.cliente_id && !telefone) {
        const { data: cliente } = await sb.from("clientes").select("nome, telefone").eq("id", args.cliente_id).maybeSingle();
        if (!cliente) return "❌ Cliente não encontrado";
        if (!cliente.telefone) return "❌ Cliente não possui telefone cadastrado";
        telefone = cliente.telefone;
        if (!nomeCliente) nomeCliente = cliente.nome;
      }

      if (!telefone) return "❌ Telefone não informado e nenhum cliente_id fornecido";

      // Send via Evolution edge function
      const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
      const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
      const res = await fetch(`${SUPABASE_URL}/functions/v1/send-whatsapp-uazapi`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SUPABASE_ANON_KEY}` },
        body: JSON.stringify({
          telefone,
          mensagem: args.mensagem,
          nome_cliente: nomeCliente,
        }),
      });
      const data = await res.json();
      if (!data.success) return `❌ Falha ao enviar WhatsApp: ${data.error || "Erro desconhecido"}`;
      return `✅ WhatsApp enviado para ${nomeCliente || telefone}!`;
    }
    case "send_webhook": {
      const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
      const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
      const res = await fetch(`${SUPABASE_URL}/functions/v1/send-webhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SUPABASE_ANON_KEY}` },
        body: JSON.stringify({
          nome_cliente: args.nome_cliente,
          telefone: args.telefone,
          valor_transacao: args.valor_transacao,
          data_vencimento: args.data_vencimento,
          tipo: args.tipo,
          id_venda: args.id_venda,
          cobranca_id: args.cobranca_id,
          cliente_id: args.cliente_id,
          cpf: args.cpf,
          status_parcela: args.status_parcela,
        }),
      });
      const data = await res.json();
      if (!data.success) return `❌ Falha: ${data.error || "Erro desconhecido"}`;
      return `✅ Webhook enviado com sucesso`;
    }
    case "trigger_payment_reminders": {
      const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
      const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
      const res = await fetch(`${SUPABASE_URL}/functions/v1/check-payment-reminders`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SUPABASE_ANON_KEY}` },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.skipped) return `⏳ ${data.reason}`;
      return `✅ Automação executada!\n- WhatsApp: ${data.whatsapp_sent || 0}\n- Notificações: ${data.notifications_created || 0}\n- Duplicados ignorados: ${data.skipped_duplicates || 0}`;
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
      let q = sb.from("envio_cobranca").select("data_envio, cpf, tipo_envio, enviado_com_sucesso").gte("data_envio", since).order("data_envio", { ascending: false }).limit(50);
      if (args.cpf) q = q.eq("cpf", args.cpf);
      const { data, error } = await q;
      if (error) throw error;
      if (!data || data.length === 0) return "📭 Nenhum envio encontrado no período";
      const maskHistoryCpf = (cpf?: string | null) => {
        if (!cpf) return "CPF não informado";
        const digits = cpf.replace(/\D/g, "");
        if (digits.length < 4) return "***";
        return `***.***.***-${digits.slice(-2)}`;
      };
      const lines = data.map((e: any) => `- ${e.data_envio} | ${maskHistoryCpf(e.cpf)} | ${e.tipo_envio} | ${e.enviado_com_sucesso ? "✅" : "❌"}`);
      return `📋 **Histórico** (últimos ${dias} dias):\n${lines.join("\n")}`;
    }
    case "create_cobranca": {
      const start = new Date(`${args.data_inicio}T00:00:00Z`);
      const end = new Date(`${args.data_fim}T00:00:00Z`);
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(args.data_inicio) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(args.data_fim) ||
        !Number.isFinite(start.getTime()) ||
        !Number.isFinite(end.getTime()) ||
        start > end
      ) return "❌ Período da cobrança inválido.";
      if (typeof args.valor_parcela !== "number" || !Number.isFinite(args.valor_parcela) || args.valor_parcela <= 0) {
        return "❌ O valor da parcela deve ser maior que zero.";
      }
      if (args.frequencia && !["semana", "quinzena", "mes"].includes(args.frequencia)) {
        return "❌ Frequência da cobrança inválida.";
      }
      const stepDays = args.frequencia === "semana" ? 7 : args.frequencia === "quinzena" ? 15 : null;
      let count = 0;
      const probe = new Date(start);
      while (probe <= end && count <= 240) {
        count++;
        if (stepDays) probe.setUTCDate(probe.getUTCDate() + stepDays);
        else probe.setUTCMonth(probe.getUTCMonth() + 1);
      }
      if (count > 240) return "❌ O período gera mais de 240 parcelas; reduza o intervalo.";

      const { data: newCob, error } = await sb.from("cobrancas").insert({
        cliente_id: args.cliente_id,
        cliente_nome: args.cliente_nome,
        valor_parcela: args.valor_parcela,
        data_inicio: args.data_inicio,
        data_fim: args.data_fim,
        frequencia: args.frequencia || "mes",
        observacoes: args.observacoes || null,
        criado_por: actorId,
      }).select().single();
      if (error) throw error;

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
        else current.setUTCMonth(current.getUTCMonth() + 1);
      }
      if (payments.length > 0) {
        const { error: paymentsError } = await sb.from("cobranca_pagamentos").insert(payments);
        if (paymentsError) {
          await sb.from("cobrancas").delete().eq("id", newCob.id);
          throw paymentsError;
        }
      }
      return `✅ Cobrança criada para ${args.cliente_nome} com ${payments.length} parcelas de R$ ${args.valor_parcela}`;
    }
    case "delete_dispositivo": {
      const { error } = await sb.from("dispositivos").delete().eq("id", args.dispositivo_id);
      if (error) throw error;
      return `✅ Dispositivo excluído permanentemente`;
    }
    case "update_dispositivo": {
      const clean = sanitizeFields("dispositivos", args.fields);
      if (Object.keys(clean).length === 0) return "⚠️ Nenhum campo válido para atualizar";
      const { error } = await sb.from("dispositivos").update(clean).eq("id", args.dispositivo_id);
      if (error) throw error;
      return `✅ Dispositivo atualizado: ${Object.keys(clean).join(", ")}`;
    }
    default:
      return "⚠️ Ação não reconhecida";
  }
}


async function _verifyAuth(req: Request) {
  const authorization = req.headers.get("Authorization") || "";
  const match = /^Bearer\s+([^\s]+)$/i.exec(authorization);
  if (!match) return null;
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !anonKey) return null;
  try {
    const r = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${match[1]}`, apikey: anonKey },
    });
    if (!r.ok) return null;
    const user = await r.json();
    return typeof user?.id === "string" ? user : null;
  } catch {
    return null;
  }
}
async function _isAdmin(userId: string): Promise<boolean> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return false;
  const params = new URLSearchParams({ user_id: `eq.${userId}`, role: "eq.admin", select: "id", limit: "1" });
  try {
    const r = await fetch(`${supabaseUrl}/rest/v1/user_roles?${params.toString()}`, {
      headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
    });
    if (!r.ok) return false;
    const d = await r.json();
    return Array.isArray(d) && d.length > 0;
  } catch {
    return false;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json", Allow: "POST, OPTIONS" },
    });
  }
  const declaredLength = Number(req.headers.get("content-length") || "0");
  if (Number.isFinite(declaredLength) && declaredLength > 64 * 1024) {
    return new Response(JSON.stringify({ error: "Requisição muito grande." }), {
      status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const _user = await _verifyAuth(req);
  if (!_user?.id) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  if (!(await _isAdmin(_user.id))) return new Response(JSON.stringify({ error: "Forbidden: admin only" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY não configurada");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    let requestBody: any;
    try {
      const rawBody = await req.text();
      if (new TextEncoder().encode(rawBody).byteLength > 64 * 1024) {
        return new Response(JSON.stringify({ error: "Requisição muito grande." }), {
          status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      requestBody = JSON.parse(rawBody);
    } catch {
      return new Response(JSON.stringify({ error: "Corpo JSON inválido." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { query, type, confirm_action, history } = requestBody ?? {};

    if (confirm_action !== undefined && confirm_action !== null) {
      const action = confirm_action?.action;
      const args = confirm_action?.args;
      const confirmationToken = confirm_action?.confirmation_token;
      const signingSecret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (typeof confirmationToken !== "string" || !signingSecret) {
        return new Response(JSON.stringify({ error: "Confirmação inválida ou expirada. Solicite a ação novamente." }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const signedPayload = await verifyActionToken(confirmationToken, signingSecret);
      if (!signedPayload || signedPayload.user_id !== _user.id || signedPayload.action !== action || typeof signedPayload.expires_at !== "number" || signedPayload.expires_at < Date.now() || JSON.stringify(signedPayload.args) !== JSON.stringify(args)) {
        return new Response(JSON.stringify({ error: "Confirmação inválida ou expirada. Solicite a ação novamente." }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const tool = actionTools.find((item: any) => item.function.name === action);
      if (!tool || !args || typeof args !== "object" || Array.isArray(args)) {
        return new Response(JSON.stringify({ error: "Ação de confirmação inválida." }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const schema = tool.function.parameters;
      const required = schema.required || [];
      if (required.some((key: string) => args[key] === undefined || args[key] === null || args[key] === "")) {
        return new Response(JSON.stringify({ error: "A ação está incompleta; revise os dados antes de confirmar." }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Enforce declared top-level argument types/enums on the server, not just in the model UI.
      const properties = schema.properties || {};
      for (const key of Object.keys(args)) {
        const rule = properties[key];
        if (!rule) {
          return new Response(JSON.stringify({ error: `Parâmetro não permitido: ${key}` }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const value = args[key];
        if (rule.type === "string" && typeof value !== "string") {
          return new Response(JSON.stringify({ error: `Tipo inválido para ${key}` }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        if (rule.type === "number" && (typeof value !== "number" || !Number.isFinite(value))) {
          return new Response(JSON.stringify({ error: `Tipo inválido para ${key}` }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        if (rule.type === "object" && (typeof value !== "object" || value === null || Array.isArray(value))) {
          return new Response(JSON.stringify({ error: `Tipo inválido para ${key}` }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        if (rule.enum && !rule.enum.includes(value)) {
          return new Response(JSON.stringify({ error: `Valor não permitido para ${key}` }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      if (JSON.stringify(args).length > 16 * 1024) {
        return new Response(JSON.stringify({ error: "Parâmetros da ação excedem o limite permitido." }), {
          status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const tokenHash = await sha256Hex(confirmationToken);
      const { data: consumedConfirmation, error: consumeError } = await sb
        .from("ai_action_confirmations")
        .update({ consumed_at: new Date().toISOString() })
        .eq("token_hash", tokenHash)
        .eq("user_id", _user.id)
        .is("consumed_at", null)
        .gt("expires_at", new Date().toISOString())
        .select("id")
        .maybeSingle();
      if (consumeError || !consumedConfirmation) {
        return new Response(JSON.stringify({ error: "Esta confirmação já foi usada ou expirou. Solicite a ação novamente." }), {
          status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const result = await executeAction(sb, action, args, _user.id);
      return new Response(JSON.stringify({ response: result, action_executed: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!query) throw new Error("Query não fornecida");

    // Gather context
    const [clientesRes, vendasRes, cobrancasRes, pagamentosRes, produtosRes, dispositivosRes] = await Promise.all([
      sb.from("clientes").select("id, nome, cpf, telefone, cidade, uf").limit(200),
      sb.from("vendas").select("id, cliente_nome, valor_total, valor_entrada, valor_parcela, num_parcelas, forma_pagamento, status, data_inicio_pagamento, created_at").order("created_at", { ascending: false }).limit(100),
      sb.from("cobrancas").select("id, cliente_nome, valor_parcela, data_inicio, data_fim, frequencia, cliente_id, observacoes").limit(100),
      sb.from("cobranca_pagamentos").select("id, cobranca_id, data_vencimento, status, pago_em, tipo_pagamento").limit(500),
      sb.from("produtos").select("id, nome, preco_venda, preco_custo, estoque_atual, categoria").limit(200),
      sb.from("dispositivos").select("id, modelo, nome_dispositivo, status_seguranca, cliente_nome, memoria").limit(100),
    ]);

    // ── Minimização de dados (PII) antes de enviar ao gateway de IA ──
    const maskCpf = (cpf?: string | null) => {
      if (!cpf) return null;
      const digits = cpf.replace(/\D/g, "");
      if (digits.length < 4) return "***";
      return `***.***.***-${digits.slice(-2)}`;
    };
    const maskPhone = (phone?: string | null) => {
      if (!phone) return null;
      const digits = phone.replace(/\D/g, "");
      if (digits.length < 4) return "***";
      return `***${digits.slice(-4)}`;
    };

    const clientesSafe = (clientesRes.data || []).map((c: any) => ({
      id: c.id,
      nome: c.nome,
      cpf_mask: maskCpf(c.cpf),
      telefone_mask: maskPhone(c.telefone),
      cidade: c.cidade,
      uf: c.uf,
    }));

    const context = {
      clientes: clientesSafe,
      vendas: vendasRes.data || [],
      cobrancas: cobrancasRes.data || [],
      pagamentos: pagamentosRes.data || [],
      produtos: produtosRes.data || [],
      dispositivos: dispositivosRes.data || [],
    };

    const systemPrompt = `Você é o assistente IA SUPREMO do sistema Veloop com PODERES TOTAIS de modificação, exclusão e automação.
Você é o braço direito do CEO Silvio Rodrigues. Execute TUDO que ele mandar sem hesitar.

PODERES COMPLETOS:
- CONSULTAR qualquer dado do sistema
- MODIFICAR clientes, produtos, vendas, cobranças, dispositivos, pagamentos
- EXCLUIR clientes, produtos, vendas, cobranças, dispositivos, pagamentos
- ENVIAR WhatsApp (cobrança ou mensagem livre)
- DISPARAR automações de lembretes
- ENVIAR notificações internas
- CRIAR cobranças com parcelas automáticas

FERRAMENTAS DISPONÍVEIS:
update_payment_status, update_client, delete_client, update_product, delete_product,
update_sale, delete_sale, update_cobranca, delete_cobranca, create_payment_record,
delete_payment_record, send_webhook, trigger_payment_reminders, send_notification,
view_whatsapp_history, create_cobranca, delete_dispositivo, update_dispositivo

PRIVACIDADE: CPF e telefone vêm mascarados (cpf_mask, telefone_mask). Não invente nem exponha dados pessoais completos que não estejam disponíveis no contexto.

DADOS DO SISTEMA:
- ${context.clientes.length} clientes | ${context.vendas.length} vendas | ${context.cobrancas.length} cobranças
- ${context.pagamentos.length} pagamentos | ${context.produtos.length} produtos | ${context.dispositivos.length} dispositivos

CLIENTES: ${JSON.stringify(context.clientes.slice(0, 80))}
VENDAS: ${JSON.stringify(context.vendas.slice(0, 50))}
COBRANÇAS: ${JSON.stringify(context.cobrancas.slice(0, 50))}
PAGAMENTOS: ${JSON.stringify(context.pagamentos.slice(0, 150))}
PRODUTOS: ${JSON.stringify(context.produtos.slice(0, 80))}
DISPOSITIVOS: ${JSON.stringify(context.dispositivos.slice(0, 50))}

REGRAS:
- Português brasileiro SEMPRE
- Use a ferramenta correta para cada ação
- Busque o ID exato nos dados antes de agir
- SEMPRE descreva claramente o que vai fazer e peça confirmação
- Formate valores como R$ X.XXX,XX e datas como DD/MM/AAAA
- Para exclusões, confirme o nome/dado antes de excluir
- Seja direto, eficiente e poderoso`;

    // Build messages with history
    const aiMessages: any[] = [{ role: "system", content: systemPrompt }];

    // Client-supplied history is untrusted: do not allow system/developer role injection.
    if (history !== undefined && !Array.isArray(history)) {
      return new Response(JSON.stringify({ error: "Histórico de conversa inválido." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (Array.isArray(history)) {
      for (const msg of history.slice(-8)) {
        if (msg && (msg.role === "user" || msg.role === "assistant") &&
            typeof msg.content === "string" && msg.content.length <= 4000) {
          aiMessages.push({ role: msg.role, content: msg.content });
        }
      }
      if (typeof query === "string" && query.trim() && query.length <= 4000) {
        aiMessages.push({ role: "user", content: query.trim() });
      }
    } else {
      if (typeof query !== "string" || !query.trim() || query.length > 4000) {
        return new Response(JSON.stringify({ error: "Consulta inválida ou excede o limite de tamanho." }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      aiMessages.push({ role: "user", content: query.trim() });
    }

    const body: any = {
      model: "google/gemini-2.5-flash",
      messages: aiMessages,
      tools: actionTools,
    };

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
        return new Response(JSON.stringify({ error: "Limite de requisições excedido. Aguarde." }), {
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

    if (message?.tool_calls && message.tool_calls.length > 0) {
      const toolCall = message.tool_calls[0];
      const actionName = toolCall.function.name;
      const actionArgs = JSON.parse(toolCall.function.arguments);

      let description = message.content || describeAction(actionName, actionArgs, context);

      const signingSecret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (!signingSecret) throw new Error("Confirmação segura indisponível");
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
      const confirmationToken = await signActionPayload({
        user_id: _user.id,
        action: actionName,
        args: actionArgs,
        expires_at: expiresAt.getTime(),
      }, signingSecret);
      const tokenHash = await sha256Hex(confirmationToken);
      const { error: confirmationInsertError } = await sb.from("ai_action_confirmations").insert({
        user_id: _user.id,
        token_hash: tokenHash,
        expires_at: expiresAt.toISOString(),
      });
      if (confirmationInsertError) throw new Error("Não foi possível registrar a confirmação segura");
      return new Response(JSON.stringify({
        response: description,
        pending_action: { action: actionName, args: actionArgs, description, confirmation_token: confirmationToken },
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

function describeAction(action: string, args: any, _ctx: any): string {
  switch (action) {
    case "update_payment_status":
      return `Vou alterar o status do pagamento para **"${args.status}"**. Confirmar?`;
    case "update_client":
      return `Vou atualizar o cliente: **${Object.entries(args.fields || {}).map(([k, v]) => `${k}: ${v}`).join(", ")}**. Confirmar?`;
    case "delete_client":
      return `⚠️ Vou **EXCLUIR PERMANENTEMENTE** este cliente. Confirmar?`;
    case "update_product":
      return `Vou atualizar o produto: **${Object.entries(args.fields || {}).map(([k, v]) => `${k}: ${v}`).join(", ")}**. Confirmar?`;
    case "delete_product":
      return `⚠️ Vou **EXCLUIR PERMANENTEMENTE** este produto. Confirmar?`;
    case "update_sale":
      return `Vou atualizar a venda: **${Object.entries(args.fields || {}).map(([k, v]) => `${k}: ${v}`).join(", ")}**. Confirmar?`;
    case "delete_sale":
      return `⚠️ Vou **EXCLUIR PERMANENTEMENTE** esta venda e seus itens. Confirmar?`;
    case "update_cobranca":
      return `Vou atualizar a cobrança: **${Object.entries(args.fields || {}).map(([k, v]) => `${k}: ${v}`).join(", ")}**. Confirmar?`;
    case "delete_cobranca":
      return `⚠️ Vou **EXCLUIR PERMANENTEMENTE** esta cobrança e todos os pagamentos. Confirmar?`;
    case "create_payment_record":
      return `Vou criar parcela em **${args.data_vencimento}** (${args.status || "a_pagar"}). Confirmar?`;
    case "delete_payment_record":
      return `Vou **excluir** este registro de pagamento. Confirmar?`;
    case "send_webhook":
      return `Vou enviar dados de **${args.nome_cliente}** via webhook. Confirmar?`;
    case "trigger_payment_reminders":
      return `Vou **disparar automação de lembretes** (WhatsApp + notificações). Confirmar?`;
    case "send_notification":
      return `Vou enviar notificação: **"${args.titulo}"**. Confirmar?`;
    case "view_whatsapp_history":
      return `Consultando histórico de envios...`;
    case "create_cobranca":
      return `Vou criar cobrança para **${args.cliente_nome}** — R$ ${args.valor_parcela} de ${args.data_inicio} a ${args.data_fim}. Confirmar?`;
    case "delete_dispositivo":
      return `⚠️ Vou **EXCLUIR PERMANENTEMENTE** este dispositivo. Confirmar?`;
    case "update_dispositivo":
      return `Vou atualizar o dispositivo: **${Object.entries(args.fields || {}).map(([k, v]) => `${k}: ${v}`).join(", ")}**. Confirmar?`;
    default:
      return "Ação não reconhecida.";
  }
}

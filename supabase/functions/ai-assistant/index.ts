import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY não configurada");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { query, type } = await req.json();
    if (!query) throw new Error("Query não fornecida");

    // Gather context from database
    const [clientesRes, vendasRes, cobrancasRes, pagamentosRes, produtosRes] = await Promise.all([
      sb.from("clientes").select("id, nome, cpf, telefone, endereco, cidade, uf").limit(200),
      sb.from("vendas").select("id, cliente_nome, cliente_cpf, valor_total, valor_entrada, valor_parcela, num_parcelas, forma_pagamento, status, data_inicio_pagamento, created_at").order("created_at", { ascending: false }).limit(100),
      sb.from("cobrancas").select("id, cliente_nome, valor_parcela, data_inicio, data_fim, frequencia").limit(100),
      sb.from("cobranca_pagamentos").select("id, cobranca_id, data_vencimento, status, pago_em").limit(500),
      sb.from("produtos").select("id, nome, preco_venda, estoque_atual, categoria").limit(200),
    ]);

    const context = {
      clientes: clientesRes.data || [],
      vendas: vendasRes.data || [],
      cobrancas: cobrancasRes.data || [],
      pagamentos: pagamentosRes.data || [],
      produtos: produtosRes.data || [],
    };

    const systemPrompt = `Você é o assistente IA do sistema Veloop, especializado em gestão de vendas, cobranças e clientes.
Você tem acesso COMPLETO ao banco de dados atual do sistema. Use os dados fornecidos para responder com precisão.

DADOS ATUAIS DO SISTEMA:
- ${context.clientes.length} clientes cadastrados
- ${context.vendas.length} vendas registradas
- ${context.cobrancas.length} cobranças ativas
- ${context.pagamentos.length} registros de pagamentos
- ${context.produtos.length} produtos no catálogo

CLIENTES: ${JSON.stringify(context.clientes.slice(0, 50))}
VENDAS: ${JSON.stringify(context.vendas.slice(0, 30))}
COBRANÇAS: ${JSON.stringify(context.cobrancas.slice(0, 30))}
PAGAMENTOS: ${JSON.stringify(context.pagamentos.slice(0, 100))}
PRODUTOS: ${JSON.stringify(context.produtos.slice(0, 50))}

REGRAS:
- Responda SEMPRE em português brasileiro
- Seja preciso com valores monetários (R$) e datas
- Se encontrar inconsistências nos dados, aponte-as proativamente
- Para pesquisas, retorne dados específicos encontrados
- Dê dicas de melhoria quando relevante
- Formate valores como R$ X.XXX,XX
- Formate datas como DD/MM/AAAA
- Seja conciso mas completo`;

    let userPrompt = query;
    if (type === "proactive_tips") {
      userPrompt = `Analise os dados do sistema e forneça 2-3 dicas úteis e práticas para o administrador. 
Foque em: pagamentos atrasados, inconsistências, oportunidades de melhoria, alertas importantes.
Seja breve e direto. Use emojis para destaque visual. Cada dica em uma linha.`;
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Limite de requisições excedido. Tente novamente em instantes." }), {
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
    const content = result.choices?.[0]?.message?.content || "Sem resposta";

    return new Response(JSON.stringify({ response: content }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-assistant error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};


async function _verifyAuth(req: Request) {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return null;
  const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: Deno.env.get("SUPABASE_ANON_KEY")! },
  });
  if (!r.ok) return null;
  return await r.json();
}
async function _isAdmin(userId: string): Promise<boolean> {
  const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/rest/v1/user_roles?user_id=eq.${userId}&role=eq.admin&select=id`, {
    headers: { apikey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!}` },
  });
  if (!r.ok) return false;
  const d = await r.json();
  return Array.isArray(d) && d.length > 0;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const _user = await _verifyAuth(req);
  if (!_user?.id) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const { file_url, nome_arquivo } = await req.json();
    if (!file_url) {
      return new Response(JSON.stringify({ error: "URL do arquivo não fornecida" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY não configurada");

    const fileResponse = await fetch(file_url);
    if (!fileResponse.ok) throw new Error("Erro ao baixar arquivo");
    const fileBuffer = await fileResponse.arrayBuffer();
    const bytes = new Uint8Array(fileBuffer);
    let binary = "";
    const chunkSize = 8192;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    const fileBase64 = btoa(binary);

    const lowerName = (nome_arquivo || "").toLowerCase();
    const isPdf = lowerName.endsWith(".pdf");
    const mimeType = isPdf ? "application/pdf" : "image/jpeg";
    const dataUrl = `data:${mimeType};base64,${fileBase64}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          {
            role: "system",
            content: `Você é um assistente especializado em extrair dados de documentos de PDV (Ponto de Venda) e sistemas SMB PDV.
Analise o documento com EXTREMA precisão. Extraia TODOS os produtos vendidos e identifique o cliente comprador.
Para cada produto extraia: nome exato, quantidade, preço unitário e subtotal.
Extraia também os dados do cliente: nome completo, CPF, telefone se disponível.
Se houver valor total da venda, entrada, parcelas ou forma de pagamento, extraia também.
NUNCA invente dados. Se um campo não estiver visível, retorne null.
Leia cada linha com atenção máxima. Não pule nenhum item da lista de produtos.
O nome do arquivo é: "${nome_arquivo}" - use como referência.`,
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Analise este documento de PDV/SMB PDV. Extraia com precisão absoluta:
1. Dados do CLIENTE (nome, CPF, telefone)
2. TODOS os PRODUTOS comprados (nome, quantidade, preço unitário, subtotal)
3. Dados financeiros (valor total, entrada, parcelas, forma de pagamento)

Seja extremamente preciso. Não omita nenhum produto. Cada item da lista deve ser extraído.`,
              },
              {
                type: "image_url",
                image_url: { url: dataUrl },
              },
            ],
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_pdv_data",
              description: "Dados extraídos do documento PDV com produtos e cliente",
              parameters: {
                type: "object",
                properties: {
                  cliente_nome: { type: "string", description: "Nome completo do cliente comprador" },
                  cliente_cpf: { type: ["string", "null"], description: "CPF do cliente" },
                  cliente_telefone: { type: ["string", "null"], description: "Telefone do cliente" },
                  produtos: {
                    type: "array",
                    description: "Lista de todos os produtos comprados",
                    items: {
                      type: "object",
                      properties: {
                        nome: { type: "string", description: "Nome/descrição exata do produto" },
                        quantidade: { type: "number", description: "Quantidade comprada" },
                        preco_unitario: { type: "number", description: "Preço unitário do produto" },
                        subtotal: { type: "number", description: "Subtotal (quantidade × preço)" },
                        codigo_barras: { type: ["string", "null"], description: "Código de barras se disponível" },
                      },
                      required: ["nome", "quantidade", "preco_unitario", "subtotal"],
                    },
                  },
                  valor_total: { type: "number", description: "Valor total da venda" },
                  valor_entrada: { type: ["number", "null"], description: "Valor da entrada se houver" },
                  num_parcelas: { type: ["number", "null"], description: "Número de parcelas se houver" },
                  valor_parcela: { type: ["number", "null"], description: "Valor de cada parcela" },
                  forma_pagamento: { type: ["string", "null"], description: "Forma de pagamento (pix, credito, debito, boleto, carne, avista)" },
                  data_venda: { type: ["string", "null"], description: "Data da venda no formato YYYY-MM-DD" },
                },
                required: ["cliente_nome", "produtos", "valor_total"],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "extract_pdv_data" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Limite de requisições excedido. Tente novamente." }), {
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
      throw new Error("Erro na IA ao processar documento PDV");
    }

    const result = await response.json();
    let extracted: any = { cliente_nome: "", produtos: [], valor_total: 0 };
    const toolCall = result.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      extracted = JSON.parse(toolCall.function.arguments);
    } else {
      const content = result.choices?.[0]?.message?.content || "";
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) extracted = JSON.parse(jsonMatch[0]);
    }

    // Sanitize null strings
    for (const key of Object.keys(extracted)) {
      if (typeof extracted[key] === "string" && extracted[key].toLowerCase() === "null") {
        extracted[key] = null;
      }
    }

    return new Response(JSON.stringify({ data: extracted }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("scan-pdv error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

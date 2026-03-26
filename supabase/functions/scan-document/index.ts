import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { pdf_url, nome_arquivo } = await req.json();
    if (!pdf_url) {
      return new Response(JSON.stringify({ error: "URL do arquivo não fornecida" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY não configurada");

    const fileResponse = await fetch(pdf_url);
    if (!fileResponse.ok) throw new Error("Erro ao baixar arquivo");
    const fileBuffer = await fileResponse.arrayBuffer();
    const bytes = new Uint8Array(fileBuffer);
    let binary = "";
    const chunkSize = 8192;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    const fileBase64 = btoa(binary);

    const isPdf = nome_arquivo.toLowerCase().endsWith(".pdf");
    const mimeType = isPdf ? "application/pdf" : "image/jpeg";
    const dataUrl = `data:${mimeType};base64,${fileBase64}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `Você é um assistente especializado em identificar e extrair dados de documentos financeiros brasileiros.
Primeiro identifique o tipo do documento: boleto bancário, carnê de pagamento ou nota fiscal.
Depois extraia os dados relevantes conforme o tipo identificado.
O nome do arquivo é: "${nome_arquivo}" - use como dica se necessário.`
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Analise este documento financeiro brasileiro. Primeiro identifique o tipo (boleto, carnê ou nota fiscal), depois extraia os dados.

Para BOLETO, extraia:
- Nome do pagador/sacado
- CPF/CNPJ do pagador
- Valor do boleto
- Data de vencimento (YYYY-MM-DD)
- Número do documento
- Nome do beneficiário/cedente

Para CARNÊ, extraia:
- Nome do cliente
- CPF do cliente
- Telefone do cliente
- Valor total
- Valor de cada parcela
- Número total de parcelas
- Data da primeira parcela (YYYY-MM-DD)
- Frequência (semanal, quinzenal ou mensal)
- Valor da entrada

Para NOTA FISCAL, extraia:
- Nome do cliente/destinatário
- CPF/CNPJ do cliente
- Valor total da nota
- Data de emissão (YYYY-MM-DD)
- Número da nota fiscal
- Nome do emitente

Seja preciso nos valores e datas.`
              },
              {
                type: "image_url",
                image_url: { url: dataUrl }
              }
            ],
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_document_data",
              description: "Dados extraídos do documento financeiro",
              parameters: {
                type: "object",
                properties: {
                  tipo_documento: {
                    type: "string",
                    enum: ["boleto", "carne", "nota_fiscal"],
                    description: "Tipo do documento identificado"
                  },
                  // Common fields
                  cliente_nome: { type: "string", description: "Nome do cliente/pagador/sacado" },
                  cliente_cpf: { type: "string", description: "CPF ou CNPJ do cliente" },
                  // Boleto fields
                  valor: { type: "number", description: "Valor do boleto ou nota fiscal" },
                  data_vencimento: { type: "string", description: "Data de vencimento (boleto) ou emissão (nota) YYYY-MM-DD" },
                  numero_documento: { type: "string", description: "Número do documento/nota fiscal" },
                  beneficiario: { type: "string", description: "Nome do beneficiário/cedente/emitente" },
                  // Carnê fields
                  cliente_telefone: { type: "string", description: "Telefone do cliente" },
                  valor_total: { type: "number", description: "Valor total da venda/financiamento" },
                  valor_parcela: { type: "number", description: "Valor de cada parcela" },
                  num_parcelas: { type: "number", description: "Número total de parcelas" },
                  data_primeira_parcela: { type: "string", description: "Data da primeira parcela YYYY-MM-DD" },
                  frequencia: { type: "string", enum: ["semana", "quinzena", "mes"], description: "Frequência de pagamento" },
                  valor_entrada: { type: "number", description: "Valor da entrada, 0 se não houver" },
                },
                required: ["tipo_documento", "cliente_nome"],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "extract_document_data" } },
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
      throw new Error("Erro na IA");
    }

    const result = await response.json();
    let extracted: any = {};
    const toolCall = result.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      extracted = JSON.parse(toolCall.function.arguments);
    } else {
      const content = result.choices?.[0]?.message?.content || "";
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) extracted = JSON.parse(jsonMatch[0]);
    }

    return new Response(JSON.stringify({ data: extracted }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("scan-document error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

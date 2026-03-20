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
      return new Response(JSON.stringify({ error: "URL do PDF não fornecida" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY não configurada");

    // Download the PDF and convert to base64
    const pdfResponse = await fetch(pdf_url);
    if (!pdfResponse.ok) throw new Error("Erro ao baixar PDF");
    const pdfBuffer = await pdfResponse.arrayBuffer();
    const pdfBase64 = btoa(String.fromCharCode(...new Uint8Array(pdfBuffer)));
    const pdfDataUrl = `data:application/pdf;base64,${pdfBase64}`;

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
            content: `Você é um assistente especializado em extrair dados de carnês de pagamento brasileiros.
Analise o PDF do carnê e extraia as informações de pagamento.
O nome do arquivo é: "${nome_arquivo}" - use isso como dica para o nome do cliente se não conseguir ler do PDF.`
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Extraia os dados deste carnê de pagamento. Preciso de:
- Nome do cliente
- CPF do cliente (se visível)
- Telefone do cliente (se visível)
- Valor total da venda/financiamento
- Valor de cada parcela
- Número total de parcelas
- Data da primeira parcela (formato YYYY-MM-DD)
- Frequência de pagamento (semanal, quinzenal ou mensal)

Analise todas as páginas do carnê para encontrar essas informações.`
              },
              {
                type: "image_url",
                image_url: { url: pdfDataUrl }
              }
            ],
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_carne_data",
              description: "Dados extraídos do carnê de pagamento",
              parameters: {
                type: "object",
                properties: {
                  cliente_nome: { type: "string", description: "Nome completo do cliente" },
                  cliente_cpf: { type: "string", description: "CPF do cliente, formato 000.000.000-00" },
                  cliente_telefone: { type: "string", description: "Telefone do cliente" },
                  valor_total: { type: "number", description: "Valor total da venda/financiamento em reais" },
                  valor_parcela: { type: "number", description: "Valor de cada parcela em reais" },
                  num_parcelas: { type: "number", description: "Número total de parcelas" },
                  data_primeira_parcela: { type: "string", description: "Data da primeira parcela no formato YYYY-MM-DD" },
                  frequencia: { type: "string", enum: ["semana", "quinzena", "mes"], description: "Frequência de pagamento" },
                  valor_entrada: { type: "number", description: "Valor da entrada, se houver. 0 se não houver." },
                },
                required: ["cliente_nome", "valor_total", "valor_parcela", "num_parcelas", "data_primeira_parcela", "frequencia"],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "extract_carne_data" } },
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
    console.error("scan-carne error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

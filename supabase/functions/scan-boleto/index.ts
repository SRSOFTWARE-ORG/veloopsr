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
      return new Response(JSON.stringify({ error: "URL do PDF/imagem não fornecida" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY não configurada");

    const fileResponse = await fetch(pdf_url);
    if (!fileResponse.ok) throw new Error("Erro ao baixar arquivo");
    const fileBuffer = await fileResponse.arrayBuffer();
    const fileBase64 = btoa(String.fromCharCode(...new Uint8Array(fileBuffer)));
    
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
        model: "google/gemini-2.5-pro",
        messages: [
          {
            role: "system",
            content: `Você é um assistente especializado em extrair dados de boletos bancários brasileiros.
Analise o documento e extraia as informações de pagamento com precisão.
O nome do arquivo é: "${nome_arquivo}" - use como dica se necessário.`
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Extraia os dados deste boleto bancário. Preciso de:
- Nome do pagador/cliente (campo "Pagador" ou "Sacado")
- CPF/CNPJ do pagador (se visível)
- Valor do boleto (campo "Valor do Documento" ou similar)
- Data de vencimento (formato YYYY-MM-DD)
- Número do documento
- Nome do beneficiário/cedente (quem recebe)

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
              name: "extract_boleto_data",
              description: "Dados extraídos do boleto bancário",
              parameters: {
                type: "object",
                properties: {
                  cliente_nome: { type: "string", description: "Nome do pagador/sacado do boleto" },
                  cliente_cpf: { type: "string", description: "CPF ou CNPJ do pagador, formato 000.000.000-00" },
                  valor: { type: "number", description: "Valor do boleto em reais" },
                  data_vencimento: { type: "string", description: "Data de vencimento no formato YYYY-MM-DD" },
                  numero_documento: { type: "string", description: "Número do documento do boleto" },
                  beneficiario: { type: "string", description: "Nome do beneficiário/cedente" },
                },
                required: ["cliente_nome", "valor", "data_vencimento"],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "extract_boleto_data" } },
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
    console.error("scan-boleto error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

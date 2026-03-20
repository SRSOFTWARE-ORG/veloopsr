import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { image } = await req.json();
    if (!image) {
      return new Response(JSON.stringify({ error: "Imagem não fornecida" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY não configurada");

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
            content: `Você é um assistente especializado em extrair dados de documentos brasileiros (RG, CPF, CNH, comprovante de endereço, etc.) a partir de fotos.
Analise a imagem e extraia todos os dados que conseguir identificar.
Responda APENAS com um JSON válido com os seguintes campos (use string vazia "" para campos não encontrados):
{
  "nome": "",
  "cpf": "",
  "rg": "",
  "rg_emissor": "",
  "rg_data_emissao": "",
  "data_nascimento": "",
  "naturalidade": "",
  "nome_pai": "",
  "nome_mae": "",
  "endereco": "",
  "bairro": "",
  "cidade": "",
  "uf": "",
  "cep": "",
  "estado_civil": ""
}
Para datas use formato YYYY-MM-DD. Para CPF use formato 000.000.000-00.
Extraia o máximo de informações possível da imagem.`
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Extraia os dados do cliente desta imagem de documento:" },
              { type: "image_url", image_url: { url: image } },
            ],
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_client_data",
              description: "Dados extraídos do documento do cliente",
              parameters: {
                type: "object",
                properties: {
                  nome: { type: "string" },
                  cpf: { type: "string" },
                  rg: { type: "string" },
                  rg_emissor: { type: "string" },
                  rg_data_emissao: { type: "string" },
                  data_nascimento: { type: "string" },
                  naturalidade: { type: "string" },
                  nome_pai: { type: "string" },
                  nome_mae: { type: "string" },
                  endereco: { type: "string" },
                  bairro: { type: "string" },
                  cidade: { type: "string" },
                  uf: { type: "string" },
                  cep: { type: "string" },
                  estado_civil: { type: "string" },
                },
                required: ["nome"],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "extract_client_data" } },
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
    
    let extracted: any = {};
    const toolCall = result.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      extracted = JSON.parse(toolCall.function.arguments);
    } else {
      // Fallback: try parsing content as JSON
      const content = result.choices?.[0]?.message?.content || "";
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) extracted = JSON.parse(jsonMatch[0]);
    }

    return new Response(JSON.stringify({ data: extracted }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("scan error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

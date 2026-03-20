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
            content: `Você é um assistente especializado em extrair TODOS os dados visíveis de documentos, fichas cadastrais e formulários brasileiros a partir de fotos.
Analise a imagem com extremo cuidado e extraia ABSOLUTAMENTE TODOS os dados que conseguir identificar, incluindo:
- Nome completo
- CPF ou CNPJ (formato 000.000.000-00 ou 00.000.000/0001-00)
- Telefone/Celular (formato (00) 00000-0000)
- RG, emissor e data de emissão
- Data de nascimento (formato YYYY-MM-DD)
- Endereço completo (rua, número, CEP, bairro, cidade, UF)
- Naturalidade
- Estado civil
- Nome do pai e da mãe
- Tipo de pessoa (fisica ou juridica)
- Inscrição estadual
- E-mail
- Qualquer outro dado visível

IMPORTANTE: Não deixe NENHUM campo em branco se a informação estiver visível na imagem. Leia números de telefone com atenção, incluindo DDD.
Para datas use formato YYYY-MM-DD. Para CPF use formato 000.000.000-00. Para telefone use formato (00) 00000-0000.`
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Extraia TODOS os dados do cliente desta imagem. Preste atenção especial em números de telefone/celular, CPF e endereço. Não deixe nenhum campo em branco se a informação estiver visível." },
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
                  nome: { type: "string", description: "Nome completo do cliente" },
                  cpf: { type: "string", description: "CPF ou CNPJ, formato 000.000.000-00" },
                  telefone: { type: "string", description: "Telefone ou celular, formato (00) 00000-0000" },
                  email: { type: "string", description: "E-mail do cliente" },
                  rg: { type: "string", description: "Número do RG" },
                  rg_emissor: { type: "string", description: "Órgão emissor do RG" },
                  rg_data_emissao: { type: "string", description: "Data de emissão do RG, formato YYYY-MM-DD" },
                  data_nascimento: { type: "string", description: "Data de nascimento, formato YYYY-MM-DD" },
                  naturalidade: { type: "string", description: "Naturalidade" },
                  nome_pai: { type: "string", description: "Nome do pai" },
                  nome_mae: { type: "string", description: "Nome da mãe" },
                  endereco: { type: "string", description: "Endereço completo (rua, número)" },
                  complemento: { type: "string", description: "Complemento do endereço" },
                  bairro: { type: "string", description: "Bairro" },
                  cidade: { type: "string", description: "Cidade" },
                  uf: { type: "string", description: "Estado (UF), 2 letras" },
                  cep: { type: "string", description: "CEP, formato 00000-000" },
                  estado_civil: { type: "string", description: "Estado civil: solteiro, casado, divorciado, viuvo ou outro" },
                  tipo: { type: "string", description: "Tipo: fisica ou juridica" },
                  inscricao_estadual: { type: "string", description: "Inscrição estadual" },
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

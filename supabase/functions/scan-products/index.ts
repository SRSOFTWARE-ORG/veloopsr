import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function callGeminiDirect(opts: {
  apiKey: string;
  systemInstruction: string;
  userText: string;
  fileBase64: string;
  mimeType: string;
  functionDeclaration: any;
  model?: string;
}): Promise<any> {
  const model = opts.model || "gemini-2.5-pro";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${opts.apiKey}`;
  const body = {
    systemInstruction: { parts: [{ text: opts.systemInstruction }] },
    contents: [
      { role: "user", parts: [
        { text: opts.userText },
        { inlineData: { mimeType: opts.mimeType, data: opts.fileBase64 } },
      ] },
    ],
    tools: [{ functionDeclarations: [opts.functionDeclaration] }],
    toolConfig: { functionCallingConfig: { mode: "ANY", allowedFunctionNames: [opts.functionDeclaration.name] } },
  };
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const t = await resp.text().catch(() => "");
    throw new Error(`Gemini direct error ${resp.status}: ${t}`);
  }
  const json = await resp.json();
  const parts = json?.candidates?.[0]?.content?.parts || [];
  const fnCall = parts.find((p: any) => p.functionCall)?.functionCall;
  if (fnCall?.args) return fnCall.args;
  const txt = parts.find((p: any) => p.text)?.text || "";
  const m = txt.match(/\{[\s\S]*\}/);
  if (m) return JSON.parse(m[0]);
  throw new Error("Gemini direct: resposta sem dados estruturados");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

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
            content: `Você é um assistente especializado em extrair dados de listas/tabelas de produtos.
Analise o documento e extraia TODOS os produtos listados com precisão.
Cada produto deve ter: código de barras, referência e descrição/nome.
Extraia todos os itens visíveis na tabela ou lista.`,
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Extraia todos os produtos desta imagem/documento. Para cada produto, extraia:
- codigo_barras: o código numérico longo (EAN/código de barras)
- referencia: o campo de referência (pode ser 0 ou outro valor)
- nome: a descrição/nome do produto

Retorne TODOS os produtos encontrados como array.`,
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
              name: "extract_products",
              description: "Lista de produtos extraídos do documento",
              parameters: {
                type: "object",
                properties: {
                  produtos: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        codigo_barras: { type: "string", description: "Código de barras / EAN do produto" },
                        referencia: { type: "string", description: "Referência do produto" },
                        nome: { type: "string", description: "Descrição / nome do produto" },
                      },
                      required: ["nome"],
                    },
                  },
                },
                required: ["produtos"],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "extract_products" } },
      }),
    });

    if (!response.ok) {
      const t = await response.text().catch(() => "");
      console.error("AI error:", response.status, t);
      let errorPayload: { error: string; fallback: boolean };
      if (response.status === 429) {
        errorPayload = { error: "Limite de requisições excedido. Tente novamente em instantes.", fallback: false };
      } else if (response.status === 402) {
        errorPayload = { error: "Créditos de IA insuficientes. Adicione créditos em Configurações → Workspace → Cloud & AI balance.", fallback: false };
      } else if (response.status >= 500) {
        errorPayload = { error: "SERVICE_UNAVAILABLE", fallback: true };
      } else {
        errorPayload = { error: `Erro na IA (${response.status})`, fallback: false };
      }
      return new Response(JSON.stringify(errorPayload), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await response.json();
    let extracted: any = { produtos: [] };
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
    console.error("scan-products error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido", fallback: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

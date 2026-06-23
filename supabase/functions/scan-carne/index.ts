import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};


import { createClient } from "npm:@supabase/supabase-js@2";

async function verifyAuth(req: Request): Promise<{ userId: string } | null> {
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const token = auth.replace("Bearer ", "");
  try {
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { data } = await sb.auth.getClaims(token);
    if (data?.claims?.sub) return { userId: data.claims.sub as string };
  } catch (_) { /* ignore */ }
  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const _user = await verifyAuth(req);
  if (!_user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

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

    // Download the PDF and convert to base64 (chunked to avoid stack overflow)
    const pdfResponse = await fetch(pdf_url);
    if (!pdfResponse.ok) throw new Error("Erro ao baixar PDF");
    const pdfBuffer = await pdfResponse.arrayBuffer();
    const bytes = new Uint8Array(pdfBuffer);
    let binary = "";
    const chunkSize = 8192;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    const pdfBase64 = btoa(binary);
    const pdfDataUrl = `data:application/pdf;base64,${pdfBase64}`;

    let result: any = null;
    let lastErr: any = null;
    const MAX_ATTEMPTS = 3;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const ctrl = new AbortController();
        const to = setTimeout(() => ctrl.abort(), 120_000);
        const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          signal: ctrl.signal,
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
                    type: "file",
                    file: {
                      filename: nome_arquivo || "carne.pdf",
                      file_data: pdfDataUrl,
                    },
                  },
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
        clearTimeout(to);

        if (response.status === 429 || response.status === 503) {
          const backoff = Math.min(8000, 1000 * 2 ** (attempt - 1));
          console.warn(`[scan-carne] ${response.status} tentativa ${attempt}, aguardando ${backoff}ms`);
          if (attempt < MAX_ATTEMPTS) {
            await new Promise((r) => setTimeout(r, backoff));
            continue;
          }
        }

        if (!response.ok) {
          const t = await response.text();
          throw new Error(`AI error ${response.status}: ${t.slice(0, 200)}`);
        }

        result = await response.json();
        break;
      } catch (err) {
        lastErr = err;
        if (attempt >= MAX_ATTEMPTS) throw err;
        await new Promise((r) => setTimeout(r, 1500 * attempt));
      }
    }

    if (!result) throw lastErr ?? new Error("Falha ao analisar carnê");

    let extracted: any = {};
    const toolCall = result.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      extracted = JSON.parse(toolCall.function.arguments);
    } else {
      const content = result.choices?.[0]?.message?.content || "";
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) extracted = JSON.parse(jsonMatch[0]);
    }

    // Validação anti "null" literal
    const required = ["cliente_nome", "valor_total", "valor_parcela", "num_parcelas", "data_primeira_parcela", "frequencia"];
    for (const k of required) {
      const v = extracted?.[k];
      if (v === undefined || v === null || v === "" || v === "null") {
        throw new Error(`Não consegui extrair "${k}" deste carnê. Tente reescanear ou edite manualmente.`);
      }
    }
    if (Number(extracted.valor_total) <= 0 || Number(extracted.valor_parcela) <= 0) {
      throw new Error("Valores inválidos no carnê (zero ou negativo).");
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

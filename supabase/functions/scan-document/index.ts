import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Fallback: chama Gemini API diretamente quando Lovable AI sem créditos.
// Inclui retry exponencial em 429/503.
async function callGeminiDirect(opts: {
  apiKey: string;
  systemInstruction: string;
  userText: string;
  fileBase64: string;
  mimeType: string;
  functionDeclaration: any;
  model?: string;
  maxRetries?: number;
  fnLabel?: string;
}): Promise<{ data: any; attempts: number }> {
  const model = opts.model || "gemini-2.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${opts.apiKey}`;
  const body = {
    systemInstruction: { parts: [{ text: opts.systemInstruction }] },
    contents: [{ role: "user", parts: [
      { text: opts.userText },
      { inlineData: { mimeType: opts.mimeType, data: opts.fileBase64 } },
    ] }],
    tools: [{ functionDeclarations: [opts.functionDeclaration] }],
    toolConfig: { functionCallingConfig: { mode: "ANY", allowedFunctionNames: [opts.functionDeclaration.name] } },
  };

  const maxRetries = opts.maxRetries ?? 3;
  const label = opts.fnLabel || "gemini-direct";
  let attempt = 0;
  let lastErr: any = null;
  while (attempt < maxRetries) {
    attempt++;
    try {
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (resp.status === 429 || resp.status === 503) {
        const t = await resp.text().catch(() => "");
        const backoff = Math.min(8000, 1000 * 2 ** (attempt - 1)) + Math.floor(Math.random() * 400);
        console.warn(`[${label}] Gemini ${resp.status} tentativa ${attempt}/${maxRetries}, aguardando ${backoff}ms. Body: ${t.slice(0, 200)}`);
        if (attempt >= maxRetries) throw new Error(`Gemini direct ${resp.status} após ${attempt} tentativas`);
        await new Promise((r) => setTimeout(r, backoff));
        continue;
      }
      if (!resp.ok) {
        const t = await resp.text().catch(() => "");
        throw new Error(`Gemini direct error ${resp.status}: ${t.slice(0, 300)}`);
      }
      const json = await resp.json();
      const parts = json?.candidates?.[0]?.content?.parts || [];
      const fnCall = parts.find((p: any) => p.functionCall)?.functionCall;
      if (fnCall?.args) return { data: fnCall.args, attempts: attempt };
      const txt = parts.find((p: any) => p.text)?.text || "";
      const m = txt.match(/\{[\s\S]*\}/);
      if (m) return { data: JSON.parse(m[0]), attempts: attempt };
      throw new Error("Gemini direct: resposta sem dados estruturados");
    } catch (e) {
      lastErr = e;
      if (attempt >= maxRetries) break;
    }
  }
  throw lastErr ?? new Error("Gemini direct: falha desconhecida");
}

// Validação simples de schema (campos obrigatórios + tipos esperados)
function validateExtracted(data: any, required: string[]): { ok: true } | { ok: false; error: string } {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { ok: false, error: "Resposta não é um objeto JSON válido" };
  }
  for (const k of required) {
    const v = data[k];
    if (v === undefined || v === null || v === "" || v === "null") {
      return { ok: false, error: `Campo obrigatório ausente: ${k}` };
    }
  }
  return { ok: true };
}

// Loga uma execução do scan no banco (best-effort, não bloqueia resposta)
async function logScan(entry: {
  function_name: string;
  provider: string;
  status: string;
  http_status?: number | null;
  attempts?: number;
  latency_ms?: number;
  error_message?: string | null;
  nome_arquivo?: string | null;
}) {
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !SERVICE_KEY) return;
    await fetch(`${SUPABASE_URL}/rest/v1/scan_logs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        Prefer: "return=minimal",
      },
      body: JSON.stringify(entry),
    });
  } catch (e) {
    console.error("[logScan] falha:", e);
  }
}


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

  const startedAt = Date.now();
  let nome_arquivoCtx: string | null = null;
  try {
    const { pdf_url, nome_arquivo } = await req.json();
    nome_arquivoCtx = nome_arquivo ?? null;
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
            content: `Você é um assistente especializado em identificar e extrair ABSOLUTAMENTE TODOS os dados visíveis de documentos financeiros brasileiros.
Primeiro identifique o tipo do documento: boleto bancário, carnê de pagamento ou nota fiscal.
Depois extraia TODOS os dados relevantes conforme o tipo identificado. NÃO omita nenhum dado visível.
Leia com extrema atenção cada campo, incluindo endereço completo, CPF, telefone, RG, filiação, etc.
O nome do arquivo é: "${nome_arquivo}" - use como dica se necessário.`
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Analise este documento financeiro brasileiro. Primeiro identifique o tipo (boleto, carnê ou nota fiscal), depois extraia TODOS os dados visíveis.

IMPORTANTE: Extraia ABSOLUTAMENTE TODOS os dados que estiverem visíveis no documento, sem exceção. Leia com atenção cada campo.

Para BOLETO, extraia:
- Nome do pagador/sacado
- CPF/CNPJ do pagador (formato 000.000.000-00 ou 00.000.000/0001-00)
- Telefone do pagador (se visível, formato (00) 00000-0000)
- Endereço do pagador (rua, número)
- Bairro, cidade, UF, CEP do pagador
- Valor do boleto
- Data de vencimento (YYYY-MM-DD)
- Número do documento
- Nome do beneficiário/cedente

Para CARNÊ, extraia:
- Nome do cliente
- CPF do cliente (formato 000.000.000-00)
- Telefone do cliente (formato (00) 00000-0000)
- Endereço, bairro, cidade, UF, CEP
- RG, emissor, data emissão
- Data de nascimento (YYYY-MM-DD)
- Nome do pai, nome da mãe
- Naturalidade, estado civil
- Valor total
- Valor de cada parcela
- Número total de parcelas
- Data da primeira parcela (YYYY-MM-DD)
- Frequência (semanal, quinzenal ou mensal)
- Valor da entrada

Para NOTA FISCAL, extraia:
- Nome do cliente/destinatário
- CPF/CNPJ do cliente
- Telefone do cliente
- Endereço, bairro, cidade, UF, CEP
- Valor total da nota
- Data de emissão (YYYY-MM-DD)
- Número da nota fiscal
- Nome do emitente

NÃO DEIXE NENHUM CAMPO EM BRANCO se a informação estiver visível. Seja preciso nos valores e datas.`
              },
              isPdf
                ? {
                    type: "file",
                    file: {
                      filename: nome_arquivo || "documento.pdf",
                      file_data: dataUrl,
                    },
                  }
                : {
                    type: "image_url",
                    image_url: { url: dataUrl },
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
                  cliente_nome: { type: "string", description: "Nome do cliente/pagador/sacado" },
                  cliente_cpf: { type: "string", description: "CPF ou CNPJ do cliente, formato 000.000.000-00" },
                  telefone: { type: "string", description: "Telefone do cliente, formato (00) 00000-0000" },
                  email: { type: "string", description: "E-mail do cliente" },
                  endereco: { type: "string", description: "Endereço completo (rua, número)" },
                  complemento: { type: "string", description: "Complemento do endereço" },
                  bairro: { type: "string", description: "Bairro" },
                  cidade: { type: "string", description: "Cidade" },
                  uf: { type: "string", description: "Estado (UF), 2 letras" },
                  cep: { type: "string", description: "CEP, formato 00000-000" },
                  rg: { type: "string", description: "Número do RG" },
                  rg_emissor: { type: "string", description: "Órgão emissor do RG" },
                  rg_data_emissao: { type: "string", description: "Data de emissão do RG, formato YYYY-MM-DD" },
                  data_nascimento: { type: "string", description: "Data de nascimento, formato YYYY-MM-DD" },
                  naturalidade: { type: "string", description: "Naturalidade" },
                  estado_civil: { type: "string", description: "Estado civil" },
                  nome_pai: { type: "string", description: "Nome do pai" },
                  nome_mae: { type: "string", description: "Nome da mãe" },
                  tipo: { type: "string", description: "Tipo de pessoa: fisica ou juridica" },
                  inscricao_estadual: { type: "string", description: "Inscrição estadual" },
                  // Boleto fields
                  valor: { type: "number", description: "Valor do boleto ou nota fiscal" },
                  data_vencimento: { type: "string", description: "Data de vencimento (boleto) ou emissão (nota) YYYY-MM-DD" },
                  numero_documento: { type: "string", description: "Número do documento/nota fiscal" },
                  beneficiario: { type: "string", description: "Nome do beneficiário/cedente/emitente" },
                  // Carnê fields
                  cliente_telefone: { type: "string", description: "Telefone do cliente (alternativo)" },
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
      const t = await response.text().catch(() => "");
      console.error("AI error:", response.status, t);

      // Fallback: tenta Gemini API diretamente quando rate-limit/credits
      const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
      if ((response.status === 402 || response.status === 429) && GEMINI_API_KEY) {
        try {
          console.log("[scan-document] Fallback para Gemini direto");
          const systemPrompt = `Você é um assistente especializado em identificar e extrair ABSOLUTAMENTE TODOS os dados visíveis de documentos financeiros brasileiros (boleto, carnê ou nota fiscal). O nome do arquivo é: "${nome_arquivo}".`;
          const userPrompt = `Analise este documento e extraia TODOS os dados visíveis (nome, CPF/CNPJ, telefone, endereço completo, valores, datas, parcelas, etc.). Identifique se é boleto, carne ou nota_fiscal.`;
          const fnDecl = {
            name: "extract_document_data",
            description: "Dados extraídos do documento financeiro",
            parameters: {
              type: "object",
              properties: {
                tipo_documento: { type: "string", enum: ["boleto", "carne", "nota_fiscal"] },
                cliente_nome: { type: "string" },
                cliente_cpf: { type: "string" },
                telefone: { type: "string" },
                email: { type: "string" },
                endereco: { type: "string" },
                complemento: { type: "string" },
                bairro: { type: "string" },
                cidade: { type: "string" },
                uf: { type: "string" },
                cep: { type: "string" },
                rg: { type: "string" },
                rg_emissor: { type: "string" },
                rg_data_emissao: { type: "string" },
                data_nascimento: { type: "string" },
                naturalidade: { type: "string" },
                estado_civil: { type: "string" },
                nome_pai: { type: "string" },
                nome_mae: { type: "string" },
                tipo: { type: "string" },
                inscricao_estadual: { type: "string" },
                valor: { type: "number" },
                data_vencimento: { type: "string" },
                numero_documento: { type: "string" },
                beneficiario: { type: "string" },
                cliente_telefone: { type: "string" },
                valor_total: { type: "number" },
                valor_parcela: { type: "number" },
                num_parcelas: { type: "number" },
                data_primeira_parcela: { type: "string" },
                frequencia: { type: "string", enum: ["semana", "quinzena", "mes"] },
                valor_entrada: { type: "number" },
              },
              required: ["tipo_documento", "cliente_nome"],
            },
          };
          const { data: extracted, attempts } = await callGeminiDirect({
            apiKey: GEMINI_API_KEY,
            systemInstruction: systemPrompt,
            userText: userPrompt,
            fileBase64,
            mimeType,
            functionDeclaration: fnDecl,
            fnLabel: "scan-document",
          });

          const valid = validateExtracted(extracted, ["tipo_documento", "cliente_nome"]);
          if (!valid.ok) {
            console.error(`[scan-document] Validação falhou: ${valid.error}`, extracted);
            await logScan({
              function_name: "scan-document",
              provider: "gemini-direct",
              status: "invalid_schema",
              http_status: response.status,
              attempts,
              latency_ms: Date.now() - startedAt,
              error_message: valid.error,
              nome_arquivo: nome_arquivoCtx,
            });
            return new Response(JSON.stringify({ error: `Resposta inválida do Gemini: ${valid.error}`, fallback: false }), {
              status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }

          console.log(`[scan-document] Fallback OK gemini-direct em ${attempts} tentativa(s)`);
          await logScan({
            function_name: "scan-document",
            provider: "gemini-direct",
            status: "success",
            http_status: response.status,
            attempts,
            latency_ms: Date.now() - startedAt,
            nome_arquivo: nome_arquivoCtx,
          });
          return new Response(JSON.stringify({ data: extracted, provider: "gemini-direct", attempts }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        } catch (fbErr) {
          const msg = fbErr instanceof Error ? fbErr.message : String(fbErr);
          console.error("[scan-document] Gemini direct fallback falhou:", msg);
          await logScan({
            function_name: "scan-document",
            provider: "gemini-direct",
            status: "error",
            http_status: response.status,
            latency_ms: Date.now() - startedAt,
            error_message: msg,
            nome_arquivo: nome_arquivoCtx,
          });
        }
      }

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
      await logScan({
        function_name: "scan-document",
        provider: "lovable-ai",
        status: "error",
        http_status: response.status,
        latency_ms: Date.now() - startedAt,
        error_message: errorPayload.error,
        nome_arquivo: nome_arquivoCtx,
      });
      return new Response(JSON.stringify(errorPayload), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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

    await logScan({
      function_name: "scan-document",
      provider: "lovable-ai",
      status: "success",
      http_status: 200,
      latency_ms: Date.now() - startedAt,
      nome_arquivo: nome_arquivoCtx,
    });
    return new Response(JSON.stringify({ data: extracted, provider: "lovable-ai" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro desconhecido";
    console.error("scan-document error:", msg);
    await logScan({
      function_name: "scan-document",
      provider: "unknown",
      status: "exception",
      latency_ms: Date.now() - startedAt,
      error_message: msg,
      nome_arquivo: nome_arquivoCtx,
    });
    return new Response(JSON.stringify({ error: msg, fallback: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

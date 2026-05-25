import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function buildFullMessage(opts: {
  tipo: string;
  nomeCompleto: string;
  cpf: string;
  dataVencimento: string;
  valor: number;
  status: string;
  cobrancaId: string;
}) {
  const { tipo, nomeCompleto, cpf, dataVencimento, valor, status, cobrancaId } = opts;
  const valorFormatado = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valor);
  const dataFormatada = dataVencimento.split("-").reverse().join("/");
  const cpfMascarado = (cpf || "").replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.***.***-$4") || "—";
  const statusLabel = status === "pendente" ? "⚠️ PENDENTE (em atraso)" : status === "a_pagar" ? "📋 A PAGAR" : `📋 ${(status || "").toUpperCase()}`;
  const saudacao = tipo === "D-3" ? "vence em *3 dias*" : tipo === "D-1" ? "vence *amanhã*" : tipo === "D+1" ? "venceu *ontem*" : "vence *hoje*";
  const appUrl = "https://veloopsr.lovable.app";
  const pixLink = `${appUrl}/pagar/${cobrancaId}/${dataVencimento}?valor=${valor}&cliente=${encodeURIComponent(nomeCompleto)}&parcela=${encodeURIComponent(dataFormatada)}`;
  const showPixLink = tipo === "D0" || tipo === "D-1" || tipo === "D+1";

  const interestWarning = (tipo === "D0" || tipo === "D+1") ? [
    ``,
    `🚨 *ATENÇÃO — JUROS POR ATRASO* 🚨`,
    ``,
    `A partir do *1º dia de atraso*, é cobrado`,
    `*R$ 2,00 por dia* sobre o valor da fatura.`,
    ``,
  ] : [];

  return [
    `Olá, *${nomeCompleto}*! 👋`,
    ``,
    `Segue o lembrete da sua fatura que ${saudacao}:`,
    ``,
    `━━━━━━━━━━━━━━━━━━`,
    `📄 *DADOS DA FATURA*`,
    `━━━━━━━━━━━━━━━━━━`,
    `👤 *Cliente:* ${nomeCompleto}`,
    `🆔 *CPF:* ${cpfMascarado}`,
    `📅 *Vencimento:* ${dataFormatada}`,
    `💰 *Valor:* ${valorFormatado}`,
    `📊 *Status:* ${statusLabel}`,
    `━━━━━━━━━━━━━━━━━━`,
    ...interestWarning,
    ...(showPixLink ? [
      `💳 *Pague agora via PIX:*`,
      pixLink,
      ``,
    ] : []),
    status === "pendente"
      ? `⚠️ Esta fatura está *em atraso*. Regularize o quanto antes.`
      : `Por favor, efetue o pagamento até a data de vencimento.`,
    ``,
    `💡 _Deseja pagar antecipadamente? Responda *pagar*._`,
    ``,
    `Em caso de dúvidas, responda esta mensagem.`,
    ``,
    `Atenciosamente,`,
    `*SR Software — Veloop* 🟢`,
  ].join("\n");
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const _user = await _verifyAuth(req);
  if (!_user?.id) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  if (!(await _isAdmin(_user.id))) return new Response(JSON.stringify({ error: "Forbidden: admin only" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const { data: enviosFalhos, error: fetchError } = await supabase
      .from("envio_cobranca")
      .select("id, telefone, mensagem, cobranca_id, cliente_id, cpf, status_fatura, tipo_envio, data_envio")
      .eq("enviado_com_sucesso", false)
      .gte("criado_em", "2026-05-08T00:00:00Z")
      .order("criado_em", { ascending: true });

    if (fetchError) throw fetchError;
    if (!enviosFalhos?.length) {
      return new Response(JSON.stringify({ success: true, message: "Nenhum envio pendente." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const UAZAPI_URL = Deno.env.get("UAZAPI_URL");
    const UAZAPI_TOKEN = Deno.env.get("UAZAPI_TOKEN");
    if (!UAZAPI_URL || !UAZAPI_TOKEN) throw new Error("UAZAPI não configurada");
    const apiUrl = UAZAPI_URL.replace(/\/+$/, "");

    let successCount = 0;
    let failCount = 0;
    const results: any[] = [];

    // Pre-fetch cobrancas and clientes to rebuild messages
    const cobrancaIds = [...new Set(enviosFalhos.map(e => e.cobranca_id).filter(Boolean))] as string[];
    const clienteIds = [...new Set(enviosFalhos.map(e => e.cliente_id).filter(Boolean))] as string[];
    const [cobsRes, clisRes] = await Promise.all([
      cobrancaIds.length ? supabase.from("cobrancas").select("id, cliente_nome, valor_parcela").in("id", cobrancaIds) : Promise.resolve({ data: [] }),
      clienteIds.length ? supabase.from("clientes").select("id, nome, cpf, telefone").in("id", clienteIds) : Promise.resolve({ data: [] }),
    ]);
    const cobMap = new Map((cobsRes.data || []).map((c: any) => [c.id, c]));
    const cliMap = new Map((clisRes.data || []).map((c: any) => [c.id, c]));

    for (const envio of enviosFalhos) {
      try {
        let phone = envio.telefone.replace(/\D/g, "");
        if (phone.startsWith("0")) phone = phone.slice(1);
        if (!phone.startsWith("55")) phone = "55" + phone;

        // Sempre reconstrói a mensagem completa (corrige stubs antigos "WhatsApp D-1 — R$ X")
        const cob: any = envio.cobranca_id ? cobMap.get(envio.cobranca_id) : null;
        const cli: any = envio.cliente_id ? cliMap.get(envio.cliente_id) : null;
        const nome = cob?.cliente_nome || cli?.nome || "Cliente";
        const valor = Number(cob?.valor_parcela || 0);
        const cpf = cli?.cpf || envio.cpf || "";
        const dataVenc = envio.data_envio || new Date().toISOString().slice(0, 10);

        const mensagem = (envio.mensagem && !/^WhatsApp\s+D[-+]?\d?\s+—/.test(envio.mensagem))
          ? envio.mensagem
          : buildFullMessage({
              tipo: envio.tipo_envio || "D0",
              nomeCompleto: nome,
              cpf,
              dataVencimento: dataVenc,
              valor,
              status: envio.status_fatura || "pendente",
              cobrancaId: envio.cobranca_id || "",
            });

        const response = await fetch(`${apiUrl}/send/text`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "token": UAZAPI_TOKEN },
          body: JSON.stringify({ number: phone, text: mensagem, linkPreview: false }),
        });
        const result = await response.json().catch(() => ({}));
        const success = response.ok && !result.error;

        if (success) {
          await supabase.from("envio_cobranca").update({ enviado_com_sucesso: true, mensagem }).eq("id", envio.id);
          successCount++;
          results.push({ id: envio.id, status: "success" });
        } else {
          failCount++;
          results.push({ id: envio.id, status: "fail", error: result.error || response.statusText });
        }
      } catch (err) {
        failCount++;
        results.push({ id: envio.id, status: "error", error: err instanceof Error ? err.message : String(err) });
      }
      await new Promise(r => setTimeout(r, 1500));
    }

    return new Response(JSON.stringify({
      success: true, total: enviosFalhos.length, reenviados: successCount, falhas: failCount, detalhes: results,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: error instanceof Error ? error.message : String(error) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

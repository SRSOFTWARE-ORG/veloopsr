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
  // Formato humano, anti-banimento (sem links lovable.app, sem separadores ASCII, sem excesso de emojis)
  const { tipo, nomeCompleto, dataVencimento, valor, status } = opts;
  const valorFormatado = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valor);
  const dataFormatada = dataVencimento.split("-").reverse().join("/");
  const primeiroNome = (nomeCompleto || "Cliente").split(" ")[0];
  const saudacoes = ["Oi", "Olá", "Bom dia"];
  const saudacao = saudacoes[Math.floor(Math.random() * saudacoes.length)];

  if (tipo === "D-3") {
    return [
      `${saudacao}, ${primeiroNome}!`,
      ``,
      `Passando para lembrar que sua parcela de ${valorFormatado} vence em 3 dias (${dataFormatada}).`,
      ``,
      `Qualquer dúvida é só responder por aqui.`,
      ``,
      `SR Software`,
    ].join("\n");
  }
  if (tipo === "D-1") {
    return [
      `${saudacao}, ${primeiroNome}!`,
      ``,
      `Lembrando que sua parcela de ${valorFormatado} vence amanhã (${dataFormatada}).`,
      ``,
      `Para receber o PIX, basta responder "pagar".`,
      ``,
      `SR Software`,
    ].join("\n");
  }
  if (tipo === "D+1") {
    return [
      `${saudacao}, ${primeiroNome}, tudo bem?`,
      ``,
      `Notamos que sua parcela de ${valorFormatado}, com vencimento em ${dataFormatada}, ainda não foi identificada como paga.`,
      ``,
      `Se já pagou, nos envie o comprovante. Se precisar de novo prazo, é só responder.`,
      ``,
      `SR Software`,
    ].join("\n");
  }
  // D0
  const linhaJuros = status === "pendente" ? `\nA partir de hoje, há cobrança de R$ 2,00 por dia de atraso.` : ``;
  return [
    `${saudacao}, ${primeiroNome}!`,
    ``,
    `Sua parcela de ${valorFormatado} vence hoje (${dataFormatada}).${linhaJuros}`,
    ``,
    `Para receber o PIX, basta responder "pagar".`,
    ``,
    `SR Software`,
  ].join("\n");
}

function randomDelay(minSec: number, maxSec: number) {
  const ms = Math.floor(Math.random() * (maxSec - minSec + 1) + minSec) * 1000;
  return new Promise((r) => setTimeout(r, ms));
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

    const { evoSendText, evolutionConfigured } = await import("../_shared/evolution.ts");
    if (!(await evolutionConfigured())) throw new Error("Evolution API não configurada (EVOLUTION_API_URL, EVOLUTION_API_KEY, EVOLUTION_INSTANCE)");


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
    for (const envio of enviosFalhos) {
      try {
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

        const r = await evoSendText(envio.telefone, mensagem);
        if (r.ok) {
          await supabase.from("envio_cobranca").update({ enviado_com_sucesso: true, mensagem }).eq("id", envio.id);
          successCount++;
          results.push({ id: envio.id, status: "success" });
        } else {
          failCount++;
          results.push({ id: envio.id, status: "fail", error: r.error || `HTTP ${r.status}` });

      } catch (err) {
        failCount++;
        results.push({ id: envio.id, status: "error", error: err instanceof Error ? err.message : String(err) });
      }
      await randomDelay(15, 30); // anti-ban: delay aleatório 15-30s
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

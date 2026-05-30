import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Time budget per invocation. Edge Function wall time is ~150s; leave margin.
const TIME_BUDGET_MS = 110_000;
// Anti-ban delay between sends (per project memory: 15-30s)
const DELAY_MIN_S = 15;
const DELAY_MAX_S = 30;

function randomDelay(minS: number, maxS: number): Promise<void> {
  const ms = Math.floor(Math.random() * (maxS - minS + 1) + minS) * 1000;
  return new Promise((r) => setTimeout(r, ms));
}

function sanitizePhone(phone: string): string | null {
  let cleaned = phone.replace(/\D/g, "");
  if (cleaned.startsWith("0")) cleaned = cleaned.slice(1);
  if (!cleaned.startsWith("55")) cleaned = "55" + cleaned;
  if (cleaned.length < 12 || cleaned.length > 13) return null;
  return cleaned;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const START = Date.now();

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const body = await req.json().catch(() => ({}));
    const { comunicado_id, test_phone, test_name, filtro, _resume } = body;

    const isTest = !!test_phone;
    const isResume = !!_resume;

    const authHeader = req.headers.get("authorization");

    // Service client always available
    const serviceClient = createClient(supabaseUrl, serviceKey);

    // Identify user (skipped on background resume calls authenticated with service role)
    let userId: string | null = null;
    if (isResume) {
      // Resume só pode ser disparado pela própria função usando service role.
      const auth = (authHeader || "").replace(/^Bearer\s+/i, "");
      if (auth !== serviceKey) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else {
      if (!authHeader) {
        return new Response(JSON.stringify({ error: "Não autorizado" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user }, error: authError } = await userClient.auth.getUser();
      if (authError || !user) {
        return new Response(JSON.stringify({ error: "Sessão inválida" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      userId = user.id;
    }


    const { evoSendText, evoSendMedia, evolutionConfigured } = await import("../_shared/evolution.ts");

    if (!(await evolutionConfigured())) {
      return new Response(JSON.stringify({ error: "Evolution API não configurada" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }



    // ===== TEST MODE =====
    if (isTest) {
      const phone = sanitizePhone(test_phone);
      if (!phone) {
        return new Response(JSON.stringify({ error: "Número de teste inválido" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { mensagem, formato, media_url } = body;
      const finalMsg = (mensagem || "")
        .replace(/\{\{nome\}\}/gi, test_name || "Cliente")
        .replace(/\{\{nome_completo\}\}/gi, test_name || "Cliente Teste")
        .replace(/\{\{cpf\}\}/gi, "000.000.000-00")
        .replace(/\{\{telefone\}\}/gi, test_phone)
        .replace(/\{\{email\}\}/gi, "teste@email.com");

      let success = false;
      if (formato === "midia" && media_url) {
        const r = await evoSendMedia({ phone, mediatype: "image", media: media_url, caption: finalMsg });
        success = r.ok;
      } else {
        const r = await evoSendText(phone, finalMsg);
        success = r.ok;
      }


      return new Response(JSON.stringify({ success, test: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ===== BULK MODE =====
    if (!comunicado_id) {
      return new Response(JSON.stringify({ error: "comunicado_id obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get comunicado
    const { data: comunicado } = await serviceClient
      .from("comunicados")
      .select("*")
      .eq("id", comunicado_id)
      .single();

    if (!comunicado) {
      return new Response(JSON.stringify({ error: "Comunicado não encontrado" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if destinatarios already exist (resume vs initial)
    const { count: existingCount } = await serviceClient
      .from("comunicado_destinatarios")
      .select("id", { count: "exact", head: true })
      .eq("comunicado_id", comunicado_id);

    const isInitial = (existingCount || 0) === 0;

    // ===== INITIAL DISPATCH: build recipient list =====
    if (isInitial) {
      const { data: clientes } = await serviceClient
        .from("clientes")
        .select("id, nome, telefone, cpf, email")
        .not("telefone", "is", null);

      if (!clientes || clientes.length === 0) {
        return new Response(JSON.stringify({ error: "Nenhum cliente com telefone cadastrado" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Apply payment status filter using projected dates
      let allowedClientIds: Set<string> | null = null;
      if (filtro && filtro !== "todos") {
        const { data: cobrancas } = await serviceClient
          .from("cobrancas").select("id, cliente_id, data_inicio, data_fim, frequencia");
        const { data: pagamentos } = await serviceClient
          .from("cobranca_pagamentos").select("cobranca_id, status, data_vencimento");

        if (cobrancas) {
          const hoje = new Date().toISOString().split("T")[0];
          const DAY = 86400000;
          const statusMap = new Map<string, string>();
          for (const p of (pagamentos || [])) {
            statusMap.set(`${p.cobranca_id}_${p.data_vencimento}`, p.status);
          }
          const addMonthsP = (date: Date, months: number): Date => {
            const next = new Date(date);
            const originalDay = next.getUTCDate();
            next.setUTCDate(1);
            next.setUTCMonth(next.getUTCMonth() + months);
            const lastDay = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
            next.setUTCDate(Math.min(originalDay, lastDay));
            return next;
          };
          const genDates = (inicio: string, fim: string, freq: string): string[] => {
            const start = new Date(`${inicio}T00:00:00Z`);
            const end = new Date(`${fim}T00:00:00Z`);
            const dates: string[] = [];
            let cur = new Date(start);
            while (cur <= end) {
              dates.push(cur.toISOString().slice(0, 10));
              if (freq === "semana") cur = new Date(cur.getTime() + 7 * DAY);
              else if (freq === "quinzena") cur = new Date(cur.getTime() + 15 * DAY);
              else cur = addMonthsP(cur, 1);
            }
            return dates;
          };
          const clientesComPendente = new Set<string>();
          const clientesComAtraso = new Set<string>();
          const clientesComCobranca = new Set<string>();
          for (const cob of cobrancas) {
            const dates = genDates(cob.data_inicio, cob.data_fim, cob.frequencia);
            for (const date of dates) {
              const status = statusMap.get(`${cob.id}_${date}`) || "a_pagar";
              if (status === "pago" || status === "isento") continue;
              clientesComCobranca.add(cob.cliente_id);
              clientesComPendente.add(cob.cliente_id);
              if (date < hoje) clientesComAtraso.add(cob.cliente_id);
            }
          }
          allowedClientIds = new Set<string>();
          if (filtro === "com_pendentes") clientesComPendente.forEach(id => allowedClientIds!.add(id));
          else if (filtro === "com_atraso") clientesComAtraso.forEach(id => allowedClientIds!.add(id));
          else if (filtro === "em_dia") clientesComCobranca.forEach(id => { if (!clientesComPendente.has(id)) allowedClientIds!.add(id); });
        }
      }

      const { data: blacklist } = await serviceClient.from("whatsapp_blacklist").select("telefone");
      const blackSet = new Set((blacklist || []).map((b: any) => sanitizePhone(b.telefone)).filter(Boolean));

      const seen = new Set<string>();
      const recipients: { id: string; nome: string; telefone: string; sanitized: string }[] = [];
      for (const c of clientes) {
        const sanitized = sanitizePhone(c.telefone || "");
        if (!sanitized || seen.has(sanitized) || blackSet.has(sanitized)) continue;
        if (allowedClientIds && !allowedClientIds.has(c.id)) continue;
        seen.add(sanitized);
        recipients.push({ id: c.id, nome: c.nome, telefone: c.telefone, sanitized });
      }

      await serviceClient.from("comunicados").update({
        status: "enviando",
        total_destinatarios: recipients.length,
        total_enviados: 0,
        total_falhas: 0,
      }).eq("id", comunicado_id);

      const destRows = recipients.map((r) => ({
        comunicado_id,
        cliente_id: r.id,
        nome: r.nome,
        telefone: r.telefone,
        status: "pendente",
      }));
      for (let i = 0; i < destRows.length; i += 500) {
        await serviceClient.from("comunicado_destinatarios").insert(destRows.slice(i, i + 500));
      }
    }

    // ===== PROCESS PENDING (resume-friendly) =====
    // Always re-load pending list from DB so we can resume anytime.
    const { data: pendentesRaw } = await serviceClient
      .from("comunicado_destinatarios")
      .select("id, cliente_id, nome, telefone")
      .eq("comunicado_id", comunicado_id)
      .eq("status", "pendente");

    const pendentes = pendentesRaw || [];

    // Pre-fetch cpf/email for template variables in one call
    const clienteIds = Array.from(new Set(pendentes.map((p: any) => p.cliente_id).filter(Boolean)));
    const cliMap = new Map<string, { cpf: string | null; email: string | null }>();
    if (clienteIds.length) {
      const { data: cliExtras } = await serviceClient
        .from("clientes").select("id, cpf, email").in("id", clienteIds);
      for (const c of (cliExtras || [])) cliMap.set(c.id, { cpf: c.cpf, email: c.email });
    }

    let processedThisRun = 0;
    let timedOut = false;

    for (let i = 0; i < pendentes.length; i++) {
      // Stop before timeout — leave ~25s margin for one more send + final ops
      if (Date.now() - START > TIME_BUDGET_MS) {
        timedOut = true;
        break;
      }

      const r: any = pendentes[i];
      const sanitized = sanitizePhone(r.telefone || "");
      if (!sanitized) {
        await serviceClient
          .from("comunicado_destinatarios")
          .update({ status: "falha", erro: "Telefone inválido" })
          .eq("id", r.id);
        continue;
      }

      const firstName = (r.nome || "Cliente").split(" ")[0];
      const extras = cliMap.get(r.cliente_id) || { cpf: null, email: null };
      const finalMsg = comunicado.mensagem
        .replace(/\{\{nome\}\}/gi, firstName)
        .replace(/\{\{nome_completo\}\}/gi, r.nome || "Cliente")
        .replace(/\{\{cpf\}\}/gi, extras.cpf || "")
        .replace(/\{\{telefone\}\}/gi, r.telefone || "")
        .replace(/\{\{email\}\}/gi, extras.email || "");

      let success = false;
      let erro = "";
      try {
        if (comunicado.formato === "midia" && comunicado.media_url) {
          const rr = await evoSendMedia({ phone: sanitized, mediatype: "image", media: comunicado.media_url, caption: finalMsg });
          success = rr.ok;
          if (!success) erro = rr.error || `HTTP ${rr.status}`;
        } else {
          const rr = await evoSendText(sanitized, finalMsg);
          success = rr.ok;
          if (!success) erro = rr.error || `HTTP ${rr.status}`;
        }
      } catch (e) {
        erro = e instanceof Error ? e.message : "Erro de conexão";
      }


      await serviceClient
        .from("comunicado_destinatarios")
        .update({
          status: success ? "enviado" : "falha",
          erro: erro || null,
          enviado_em: success ? new Date().toISOString() : null,
        })
        .eq("id", r.id);

      processedThisRun++;

      // Anti-ban delay (skip if last in this batch)
      const hasMore = i < pendentes.length - 1 && (Date.now() - START) < TIME_BUDGET_MS;
      if (hasMore) await randomDelay(DELAY_MIN_S, DELAY_MAX_S);
    }

    // Recompute totals from DB (source of truth)
    const [{ count: enviadosCount }, { count: falhasCount }, { count: pendentesCount }] = await Promise.all([
      serviceClient.from("comunicado_destinatarios").select("id", { count: "exact", head: true }).eq("comunicado_id", comunicado_id).eq("status", "enviado"),
      serviceClient.from("comunicado_destinatarios").select("id", { count: "exact", head: true }).eq("comunicado_id", comunicado_id).eq("status", "falha"),
      serviceClient.from("comunicado_destinatarios").select("id", { count: "exact", head: true }).eq("comunicado_id", comunicado_id).eq("status", "pendente"),
    ]);

    const enviados = enviadosCount || 0;
    const falhas = falhasCount || 0;
    const restantes = pendentesCount || 0;

    if (restantes > 0) {
      // Still work to do — keep status as 'enviando' and self-invoke to continue
      await serviceClient.from("comunicados").update({
        status: "enviando",
        total_enviados: enviados,
        total_falhas: falhas,
        updated_at: new Date().toISOString(),
      }).eq("id", comunicado_id);

      // Fire-and-forget background continuation
      const continueUrl = `${supabaseUrl}/functions/v1/send-comunicado`;
      const continuePromise = fetch(continueUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceKey}`,
          apikey: serviceKey,
        },
        body: JSON.stringify({ comunicado_id, _resume: true }),
      }).catch((e) => console.error("[send-comunicado] resume invoke failed:", e));

      try {
        // @ts-ignore
        if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
          // @ts-ignore
          EdgeRuntime.waitUntil(continuePromise);
        }
      } catch { /* noop */ }

      return new Response(
        JSON.stringify({
          success: true,
          partial: true,
          processedThisRun,
          enviados,
          falhas,
          restantes,
          message: "Lote processado, continuação agendada automaticamente",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Done
    const totalDest = enviados + falhas;
    await serviceClient.from("comunicados").update({
      status: totalDest > 0 && falhas === totalDest ? "falha" : "concluido",
      total_enviados: enviados,
      total_falhas: falhas,
      updated_at: new Date().toISOString(),
    }).eq("id", comunicado_id);

    if (userId) {
      await serviceClient.from("audit_log").insert({
        user_id: userId,
        tabela: "comunicados",
        acao: "disparo_comunicado",
        registro_id: comunicado_id,
        detalhes: { total: totalDest, enviados, falhas },
      });
    }

    return new Response(
      JSON.stringify({ success: true, total: totalDest, enviados, falhas, processedThisRun }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("send-comunicado error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

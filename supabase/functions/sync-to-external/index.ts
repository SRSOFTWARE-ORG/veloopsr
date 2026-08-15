import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { maintenanceGuard } from "../_shared/maintenance.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const EXTERNAL_SCHEMA = "veloop_automacoes";

// Column mapping: source_col -> dest_col per table
const COLUMN_MAPPINGS: Record<string, Record<string, string>> = {
  clientes: { telefone: "whatsapp" },
};

function mapRecord(table: string, record: any): any {
  const mapping = COLUMN_MAPPINGS[table];
  if (!mapping) return record;
  const mapped: any = {};
  for (const [key, value] of Object.entries(record)) {
    const destKey = mapping[key] || key;
    mapped[destKey] = value;
  }
  return mapped;
}

// All tables to sync
const SYNC_TABLES = [
  "clientes", "vendas", "venda_itens", "cobrancas", "cobranca_pagamentos",
  "produtos", "comunicados", "comunicado_destinatarios", "whatsapp_blacklist",
  "documentos", "dispositivos", "assistencias", "envio_cobranca",
  "saidas_caixa", "estoque_movimentacao", "pix_payments", "profiles",
  "user_roles", "permissions", "notificacoes", "audit_log",
  "conversations", "messages", "checklist_entrega", "calendar_sync",
  "google_calendar_tokens", "push_subscriptions",
];

// Cache for external table columns
const externalColumnsCache: Record<string, Set<string> | null> = {};

async function getExternalColumns(
  baseUrl: string,
  apiKey: string,
  table: string,
): Promise<Set<string> | null> {
  if (table in externalColumnsCache) return externalColumnsCache[table];
  try {
    const url = `${baseUrl}/rest/v1/${table}?limit=0`;
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "apikey": apiKey,
        "Authorization": `Bearer ${apiKey}`,
        "Accept-Profile": EXTERNAL_SCHEMA,
      },
    });
    if (!res.ok) {
      await res.text();
      externalColumnsCache[table] = null;
      return null;
    }
    await res.text();
    const cols = res.headers.get("content-profile-columns") || "";
    // PostgREST doesn't return columns in headers, so we use OPTIONS/columns endpoint
    const optRes = await fetch(`${baseUrl}/rest/v1/${table}?select=*&limit=0`, {
      headers: {
        "apikey": apiKey,
        "Authorization": `Bearer ${apiKey}`,
        "Accept-Profile": EXTERNAL_SCHEMA,
        "Accept": "application/json",
        "Prefer": "count=exact",
      },
    });
    if (!optRes.ok) {
      await optRes.text();
      externalColumnsCache[table] = null;
      return null;
    }
    const optBody = await optRes.text();
    // Try to detect columns from an empty array response or headers
    // Alternative: use OpenAPI endpoint
    const apiRes = await fetch(`${baseUrl}/rest/v1/?select`, {
      headers: {
        "apikey": apiKey,
        "Authorization": `Bearer ${apiKey}`,
        "Accept-Profile": EXTERNAL_SCHEMA,
      },
    });
    if (apiRes.ok) {
      const apiData = await apiRes.json();
      if (apiData.definitions?.[table]?.properties) {
        const colSet = new Set<string>(Object.keys(apiData.definitions[table].properties));
        externalColumnsCache[table] = colSet;
        return colSet;
      }
    } else {
      await apiRes.text();
    }
    externalColumnsCache[table] = null;
    return null;
  } catch {
    externalColumnsCache[table] = null;
    return null;
  }
}

function filterColumns(data: any[], columns: Set<string>): any[] {
  return data.map((row) => {
    const filtered: any = {};
    for (const [key, value] of Object.entries(row)) {
      if (columns.has(key)) filtered[key] = value;
    }
    return filtered;
  });
}

// Direct REST upsert to external Supabase using custom schema header
async function restUpsert(
  baseUrl: string,
  apiKey: string,
  table: string,
  data: any[],
): Promise<{ ok: boolean; error?: string }> {
  // Auto-detect and filter columns
  const extCols = await getExternalColumns(baseUrl, apiKey, table);
  const finalData = extCols ? filterColumns(data, extCols) : data;

  const url = `${baseUrl}/rest/v1/${table}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "apikey": apiKey,
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Content-Profile": EXTERNAL_SCHEMA,
      "Prefer": "resolution=merge-duplicates",
    },
    body: JSON.stringify(finalData),
  });
  if (!res.ok) {
    const body = await res.text();
    return { ok: false, error: `${res.status}: ${body}` };
  }
  await res.text();
  return { ok: true };
}

async function restDelete(
  baseUrl: string,
  apiKey: string,
  table: string,
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  const url = `${baseUrl}/rest/v1/${table}?id=eq.${id}`;
  const res = await fetch(url, {
    method: "DELETE",
    headers: {
      "apikey": apiKey,
      "Authorization": `Bearer ${apiKey}`,
      "Content-Profile": EXTERNAL_SCHEMA,
    },
  });
  if (!res.ok) {
    const body = await res.text();
    return { ok: false, error: `${res.status}: ${body}` };
  }
  return { ok: true };
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
  if (req.method === "OPTIONS") {
  const _user = await _verifyAuth(req);
  if (!_user?.id) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  if (!(await _isAdmin(_user.id))) return new Response(JSON.stringify({ error: "Forbidden: admin only" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    return new Response(null, { headers: corsHeaders });
  }

  const paused = await maintenanceGuard(corsHeaders);
  if (paused) return paused;

  try {
    const externalUrl = Deno.env.get("EXTERNAL_SUPABASE_URL");
    const externalKey = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_KEY");

    if (!externalUrl || !externalKey) {
      return new Response(
        JSON.stringify({ error: "Credenciais externas não configuradas" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sourceClient = createClient(supabaseUrl, serviceKey);

    const body = await req.json().catch(() => ({}));
    const { mode = "incremental", table, record, old_record, event_type } = body;

    // Mode 1: Single record sync (called by database webhook)
    if (mode === "webhook" && table && record) {
      const result = await syncSingleRecord(externalUrl, externalKey, table, record, old_record, event_type);
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Mode 2: Full sync of all tables
    if (mode === "full") {
      const results: Record<string, { synced: number; errors: number }> = {};

      for (const tableName of SYNC_TABLES) {
        try {
          // Fetch all data from source
          let allData: any[] = [];
          let from = 0;
          const batchSize = 1000;

          while (true) {
            const { data, error } = await sourceClient
              .from(tableName)
              .select("*")
              .range(from, from + batchSize - 1);

            if (error) {
              console.error(`[Sync] Error reading ${tableName}:`, error.message);
              break;
            }
            if (!data || data.length === 0) break;
            allData = allData.concat(data);
            if (data.length < batchSize) break;
            from += batchSize;
          }

          if (allData.length === 0) {
            results[tableName] = { synced: 0, errors: 0 };
            continue;
          }

          // Apply column mappings
          allData = allData.map((row: any) => mapRecord(tableName, row));

          let synced = 0;
          let errors = 0;

          for (let i = 0; i < allData.length; i += 200) {
            const batch = allData.slice(i, i + 200);
            const res = await restUpsert(externalUrl, externalKey, tableName, batch);
            if (res.ok) {
              synced += batch.length;
            } else {
              console.error(`[Sync] Upsert error ${tableName}:`, res.error);
              errors += batch.length;
            }
          }

          results[tableName] = { synced, errors };
          console.log(`[Sync] ${tableName}: ${synced} synced, ${errors} errors`);
        } catch (e) {
          console.error(`[Sync] Table ${tableName} failed:`, e);
          results[tableName] = { synced: 0, errors: -1 };
        }
      }

      return new Response(JSON.stringify({ mode: "full", results }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ error: "Mode inválido. Use 'full' ou 'webhook'" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[Sync] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function syncSingleRecord(
  baseUrl: string,
  apiKey: string,
  table: string,
  record: any,
  oldRecord: any,
  eventType: string,
) {
  try {
    if (eventType === "DELETE" && oldRecord?.id) {
      const res = await restDelete(baseUrl, apiKey, table, oldRecord.id);
      if (!res.ok) throw new Error(res.error);
      return { success: true, action: "deleted", table };
    }

    const mappedRecord = mapRecord(table, record);
    const res = await restUpsert(baseUrl, apiKey, table, [mappedRecord]);
    if (!res.ok) throw new Error(res.error);
    return { success: true, action: eventType?.toLowerCase() || "upserted", table };
  } catch (e: any) {
    console.error(`[Sync] Single record error on ${table}:`, e.message);
    return { success: false, error: e.message, table };
  }
}

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

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
    const externalClient = createClient(externalUrl, externalKey);

    // Debug: log external URL and key details
    console.log(`[Sync] External URL: ${externalUrl}`);
    console.log(`[Sync] External Key prefix: ${externalKey.substring(0, 30)}...`);
    console.log(`[Sync] External Key length: ${externalKey.length}`);
    
    // Decode JWT to check role claim
    try {
      const parts = externalKey.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(atob(parts[1]));
        console.log(`[Sync] JWT role: ${payload.role}, ref: ${payload.ref}`);
      }
    } catch (e) {
      console.log(`[Sync] Could not decode JWT: ${e}`);
    }

    // Test direct REST API call to verify credentials
    try {
      const testRes = await fetch(`${externalUrl}/rest/v1/`, {
        headers: {
          'apikey': externalKey,
          'Authorization': `Bearer ${externalKey}`,
        }
      });
      console.log(`[Sync] Direct REST test: status=${testRes.status}, statusText=${testRes.statusText}`);
      if (!testRes.ok) {
        const errBody = await testRes.text();
        console.log(`[Sync] REST error body: ${errBody}`);
      }
    } catch (e) {
      console.log(`[Sync] REST test error: ${e}`);
    }

    const body = await req.json().catch(() => ({}));
    const { mode = "incremental", table, record, old_record, event_type } = body;

    // Mode 1: Single record sync (called by database webhook)
    if (mode === "webhook" && table && record) {
      const result = await syncSingleRecord(externalClient, table, record, old_record, event_type);
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Mode 2: Full sync of all tables
    if (mode === "full") {
      const results: Record<string, { synced: number; errors: number }> = {};

      for (const tableName of SYNC_TABLES) {
        try {
          // Ensure table exists in external DB
          await ensureTable(externalClient, tableName);

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

          // Detect available columns in external table
          let allowedColumns: Set<string> | null = null;
          try {
            const { data: probe, error: probeErr } = await externalClient
              .from(tableName)
              .select("*")
              .limit(0);
            // If table is empty we can still get column names from a single row upsert attempt
            // Use first record keys as fallback
          } catch (_) {}

          // Try first with all columns; if schema mismatch, retry with filtered columns
          let synced = 0;
          let errors = 0;

          for (let i = 0; i < allData.length; i += 200) {
            const batch = allData.slice(i, i + 200);
            const dataToSend = allowedColumns 
              ? batch.map((row: any) => {
                  const filtered: any = {};
                  for (const key of Object.keys(row)) {
                    if (allowedColumns!.has(key)) filtered[key] = row[key];
                  }
                  return filtered;
                })
              : batch;

            const { error: upsertErr } = await externalClient
              .from(tableName)
              .upsert(dataToSend, { onConflict: "id", ignoreDuplicates: false });

            if (upsertErr && upsertErr.message.includes("column") && upsertErr.message.includes("schema cache") && !allowedColumns) {
              // Detect which columns exist by trying each column individually
              console.log(`[Sync] Schema mismatch on ${tableName}, detecting columns...`);
              const sampleRow = batch[0];
              const validCols = new Set<string>();
              for (const col of Object.keys(sampleRow)) {
                const testRow: any = { id: sampleRow.id, [col]: sampleRow[col] };
                const { error: colErr } = await externalClient
                  .from(tableName)
                  .upsert(testRow, { onConflict: "id", ignoreDuplicates: false });
                if (!colErr) {
                  validCols.add(col);
                } else if (!colErr?.message?.includes("schema cache")) {
                  validCols.add(col);
                }
              }
              allowedColumns = validCols;
              console.log(`[Sync] ${tableName} valid columns: ${[...validCols].join(', ')}`);
              
              // Retry this batch with filtered columns
              const filteredBatch = batch.map((row: any) => {
                const filtered: any = {};
                for (const key of Object.keys(row)) {
                  if (allowedColumns!.has(key)) filtered[key] = row[key];
                }
                return filtered;
              });
              const { error: retryErr } = await externalClient
                .from(tableName)
                .upsert(filteredBatch, { onConflict: "id", ignoreDuplicates: false });
              if (retryErr) {
                console.error(`[Sync] Retry upsert error ${tableName}:`, retryErr.message);
                errors += batch.length;
              } else {
                synced += batch.length;
              }
            } else if (upsertErr) {
              console.error(`[Sync] Upsert error ${tableName}:`, upsertErr.message);
              errors += batch.length;
            } else {
              synced += batch.length;
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
  externalClient: any,
  table: string,
  record: any,
  oldRecord: any,
  eventType: string
) {
  try {
    if (eventType === "DELETE" && oldRecord?.id) {
      const { error } = await externalClient
        .from(table)
        .delete()
        .eq("id", oldRecord.id);
      if (error) throw error;
      return { success: true, action: "deleted", table };
    }

    // INSERT or UPDATE -> upsert
    const { error } = await externalClient
      .from(table)
      .upsert(record, { onConflict: "id" });
    if (error) throw error;
    return { success: true, action: eventType?.toLowerCase() || "upserted", table };
  } catch (e: any) {
    console.error(`[Sync] Single record error on ${table}:`, e.message);
    return { success: false, error: e.message, table };
  }
}

async function ensureTable(_client: any, _tableName: string) {
  // External tables must be pre-created with matching schema.
  // This is a no-op placeholder - the full sync SQL will create them.
}

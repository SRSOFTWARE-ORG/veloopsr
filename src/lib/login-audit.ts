import { supabase } from "@/integrations/supabase/client";
import { z } from "zod";

export const LOGIN_AUDIT_KEY = "veloop.login.diagnostics";
export type LoginOutcome = "success" | "credentials_rejected" | "email_unconfirmed" | "rate_limited" | "unavailable" | "session_failed";
type LoginDiagnostic = { id: string; at: string; outcome: LoginOutcome; attempts: number; path: string };
const diagnosticSchema = z.object({
  id: z.string().uuid(), at: z.string().datetime(),
  outcome: z.enum(["success", "credentials_rejected", "email_unconfirmed", "rate_limited", "unavailable", "session_failed"]),
  attempts: z.number().int().min(1).max(10), path: z.enum(["/login", "/acesso"]),
});

export const readLoginDiagnostics = (): LoginDiagnostic[] => {
  try {
    const data: unknown = JSON.parse(localStorage.getItem(LOGIN_AUDIT_KEY) || "[]");
    if (!Array.isArray(data)) return [];
    return data.slice(-100).flatMap(entry => {
      const parsed = diagnosticSchema.safeParse(entry);
      if (!parsed.success) return [];
      const { id, at, outcome, attempts, path } = parsed.data;
      if (!id || !at || !outcome || attempts === undefined || !path) return [];
      return [{ id, at, outcome, attempts, path }];
    });
  } catch { return []; }
};

export function recordLoginDiagnostic(outcome: LoginOutcome, attempts: number) {
  try {
    const entry: LoginDiagnostic = { id: crypto.randomUUID(), at: new Date().toISOString(), outcome, attempts,
      path: window.location.pathname === "/acesso" ? "/acesso" : "/login" };
    localStorage.setItem(LOGIN_AUDIT_KEY, JSON.stringify([...readLoginDiagnostics(), entry].slice(-100)));
  } catch { /* Diagnostics must never prevent login. */ }
}

let syncing = false;
export async function flushLoginDiagnostics() {
  if (syncing) return;
  syncing = true;
  try {
    const { data, error } = await supabase.auth.getUser();
    const user = data.user;
    if (error || !user) return;
    const entries = readLoginDiagnostics();
    if (!entries.length) return;
    const result = await supabase.from("audit_log").insert(entries.map(entry => ({
      user_id: user.id, acao: `login:${entry.outcome}`, tabela: "auth_diagnostics",
      detalhes: { diagnostic_id: entry.id, occurred_at: entry.at, attempts: entry.attempts, path: entry.path, source: "client_diagnostic" },
    })));
    if (result.error) return;
    const sent = new Set(entries.map(entry => entry.id));
    localStorage.setItem(LOGIN_AUDIT_KEY, JSON.stringify(readLoginDiagnostics().filter(entry => !sent.has(entry.id))));
  } catch { /* Keep pending diagnostics when Cloud is unavailable. */ }
  finally { syncing = false; }
}
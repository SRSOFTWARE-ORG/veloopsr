import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
const auth = vi.hoisted(() => ({ setSession: vi.fn(), getUser: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth } }));
vi.mock("@/lib/login-audit", () => ({ recordLoginDiagnostic: vi.fn(), flushLoginDiagnostics: vi.fn() }));
import { resilientSignIn } from "./resilient-auth";
import { recordLoginDiagnostic } from "./login-audit";

describe("login reliability", () => {
  beforeEach(() => { vi.clearAllMocks(); });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
  it("does not retry rejected credentials or report a server outage", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: "invalid_credentials" }), { status: 400 }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await resilientSignIn("test@example.invalid", "invalid");
    expect(result).toMatchObject({ ok: false, attempts: 1, error: "E-mail ou senha incorretos." });
    expect(result.backendDown).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("distinguishes unconfirmed email from wrong password", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: "email_not_confirmed" }), { status: 400 })));
    expect(await resilientSignIn("test@example.invalid", "invalid")).toMatchObject({ attempts: 1, error: "Confirme seu e-mail antes de entrar." });
  });
  it("aborts a stalled request within the timeout and audits the failure", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    vi.stubGlobal("fetch", vi.fn((_url, options) => new Promise((_resolve, reject) => {
      signal = options.signal;
      signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    })));
    const pending = resilientSignIn("test@example.invalid", "invalid", { attempts: 1, timeoutMs: 100 });
    await vi.advanceTimersByTimeAsync(100);
    expect(await pending).toMatchObject({ ok: false, backendDown: true, attempts: 1 });
    expect(signal?.aborted).toBe(true);
    expect(recordLoginDiagnostic).toHaveBeenCalledWith("unavailable", 1);
  });
  it("requires verified session before reporting login success", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ access_token: "test-only", refresh_token: "test-only" }))));
    auth.setSession.mockResolvedValue({ error: null });
    auth.getUser.mockResolvedValue({ data: { user: null }, error: new Error("Unavailable") });
    expect(await resilientSignIn("test@example.invalid", "invalid")).toMatchObject({ ok: false, attempts: 1, error: "Não foi possível validar a sessão. Tente entrar novamente." });
  });
});
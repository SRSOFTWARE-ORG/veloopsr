import { beforeEach, describe, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({ getUser: vi.fn(), insert: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: { getUser: mocks.getUser }, from: () => ({ insert: mocks.insert }) } }));
import { LOGIN_AUDIT_KEY, readLoginDiagnostics, recordLoginDiagnostic, flushLoginDiagnostics } from "./login-audit";

describe("login diagnostics", () => {
  beforeEach(() => { localStorage.clear(); vi.clearAllMocks(); });
  it("keeps at most 100 events with no credentials", () => {
    for (let i = 0; i < 105; i++) recordLoginDiagnostic("unavailable", 2);
    const events = readLoginDiagnostics();
    expect(events).toHaveLength(100);
    expect(Object.keys(events[0]).sort()).toEqual(["at", "attempts", "id", "outcome", "path"]);
  });
  it("never sends signed-out failures to the protected audit table", async () => {
    recordLoginDiagnostic("unavailable", 1);
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    await flushLoginDiagnostics();
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(readLoginDiagnostics()).toHaveLength(1);
  });
  it("removes pending events only after a successful authenticated audit write", async () => {
    recordLoginDiagnostic("success", 1);
    mocks.getUser.mockResolvedValue({ data: { user: { id: "verified-user" } }, error: null });
    mocks.insert.mockResolvedValueOnce({ error: new Error("Unavailable") }).mockResolvedValueOnce({ error: null });
    await flushLoginDiagnostics();
    expect(readLoginDiagnostics()).toHaveLength(1);
    await flushLoginDiagnostics();
    expect(readLoginDiagnostics()).toHaveLength(0);
    expect(mocks.insert.mock.calls[0][0][0].user_id).toBe("verified-user");
  });
  it("strips unexpected fields and ignores invalid local data", () => {
    recordLoginDiagnostic("unavailable", 1);
    const event = readLoginDiagnostics()[0];
    localStorage.setItem(LOGIN_AUDIT_KEY, JSON.stringify([{ ...event, password: "must-not-upload" }, { outcome: "bad" }]));
    expect(readLoginDiagnostics()).toEqual([event]);
  });
});
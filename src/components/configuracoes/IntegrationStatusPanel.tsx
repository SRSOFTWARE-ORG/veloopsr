import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, XCircle, AlertCircle, Plug, ChevronDown, ChevronUp, Play } from "lucide-react";

interface LogEntry {
  attempt: number;
  ok: boolean;
  status?: number;
  detail?: string;
  ms: number;
  at: string;
}

interface IntegrationStatus {
  key: string;
  name: string;
  description: string;
  status: "checking" | "online" | "offline" | "warning";
  detail?: string;
  logs: LogEntry[];
}

const CHECK_INTERVAL_MS = 8 * 60 * 60 * 1000; // 8 horas
const LAST_CHECK_KEY = "integration_status_last_check";
const MAX_ATTEMPTS = 3;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Retry com backoff exponencial: 500ms, 1500ms, 3500ms */
async function withRetry<T>(
  fn: (attempt: number) => Promise<{ value: T; ok: boolean; status?: number; detail?: string }>,
  onAttempt: (entry: LogEntry) => void,
): Promise<T> {
  let last: T | undefined;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const start = performance.now();
    try {
      const r = await fn(attempt);
      const ms = Math.round(performance.now() - start);
      onAttempt({
        attempt,
        ok: r.ok,
        status: r.status,
        detail: r.detail,
        ms,
        at: new Date().toLocaleTimeString("pt-BR"),
      });
      last = r.value;
      if (r.ok) return r.value;
    } catch (e: any) {
      const ms = Math.round(performance.now() - start);
      onAttempt({
        attempt,
        ok: false,
        detail: e?.message || "Exceção",
        ms,
        at: new Date().toLocaleTimeString("pt-BR"),
      });
    }
    if (attempt < MAX_ATTEMPTS) await sleep(500 * Math.pow(2, attempt - 1) + 500);
  }
  return last as T;
}

export default function IntegrationStatusPanel() {
  const [integrations, setIntegrations] = useState<IntegrationStatus[]>([
    { key: "mp", name: "Mercado Pago", description: "Pagamentos PIX", status: "checking", logs: [] },
    { key: "wa", name: "WhatsApp (UAZAPI)", description: "Envio de mensagens", status: "checking", logs: [] },
    { key: "gc", name: "Google Calendar", description: "Sincronização de agenda", status: "checking", logs: [] },
    { key: "ai", name: "Lovable AI / Gemini", description: "Escaneamento de documentos", status: "checking", logs: [] },
  ]);
  const [lastCheck, setLastCheck] = useState<Date | null>(null);
  const [running, setRunning] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    runCheck();
    intervalRef.current = window.setInterval(runCheck, CHECK_INTERVAL_MS);
    return () => {
      if (intervalRef.current) window.clearInterval(intervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateOne = (key: string, patch: Partial<IntegrationStatus>) => {
    setIntegrations((prev) => prev.map((i) => (i.key === key ? { ...i, ...patch } : i)));
  };

  const appendLog = (key: string, entry: LogEntry) => {
    setIntegrations((prev) =>
      prev.map((i) =>
        i.key === key ? { ...i, logs: [...i.logs.slice(-9), entry] } : i,
      ),
    );
  };

  const runCheck = async () => {
    if (running) return;
    setRunning(true);
    // Reset logs
    setIntegrations((prev) => prev.map((i) => ({ ...i, status: "checking", logs: [] })));
    await Promise.allSettled([checkMP(), checkWhatsApp(), checkGoogleCalendar(), checkAI()]);
    const now = new Date();
    setLastCheck(now);
    try { localStorage.setItem(LAST_CHECK_KEY, now.toISOString()); } catch {}
    setRunning(false);
  };

  const checkMP = async () => {
    const result = await withRetry<Partial<IntegrationStatus>>(
      async () => {
        const res = await supabase.functions.invoke("create-pix-payment", { body: { health: true } });
        if (res.error) {
          return { value: { status: "offline", detail: "Função indisponível" }, ok: false, detail: res.error.message };
        }
        const data: any = res.data;
        if (data?.ok) return { value: { status: "online", detail: "Token configurado" }, ok: true, status: 200 };
        return { value: { status: "offline", detail: "Token não configurado" }, ok: false, status: 200, detail: "ok=false" };
      },
      (e) => appendLog("mp", e),
    );
    updateOne("mp", result);
  };

  const checkWhatsApp = async () => {
    const result = await withRetry<Partial<IntegrationStatus>>(
      async () => {
        const res = await supabase.functions.invoke("send-whatsapp-uazapi", { body: { health: true } });
        if (res.error) {
          // Tenta extrair detalhes do erro 400
          const msg = res.error.message || "Erro";
          const missing = /Missing|obrigat/i.test(msg) ? " (campos ausentes)" : "";
          return { value: { status: "offline", detail: `Função indisponível${missing}` }, ok: false, detail: msg };
        }
        const data: any = res.data;
        if (data?.ok) return { value: { status: "online", detail: "URL e token configurados" }, ok: true, status: 200 };
        return { value: { status: "warning", detail: "Verificar configuração" }, ok: false, status: 200, detail: "ok=false" };
      },
      (e) => appendLog("wa", e),
    );
    updateOne("wa", result);
  };

  const checkGoogleCalendar = async () => {
    const result = await withRetry<Partial<IntegrationStatus>>(
      async () => {
        const { data, error } = await supabase
          .from("google_calendar_tokens")
          .select("id, expires_at")
          .limit(1)
          .maybeSingle();

        if (error) return { value: { status: "offline", detail: "Erro ao verificar" }, ok: false, detail: error.message };
        if (!data) return { value: { status: "offline", detail: "Nenhuma conta conectada" }, ok: true, status: 200, detail: "sem token" };
        const expired = new Date(data.expires_at) < new Date();
        if (expired) return { value: { status: "warning", detail: "Token expirado (renova auto)" }, ok: true, status: 200 };
        return { value: { status: "online", detail: "Conta conectada" }, ok: true, status: 200 };
      },
      (e) => appendLog("gc", e),
    );
    updateOne("gc", result);
  };

  const checkAI = async () => {
    const result = await withRetry<Partial<IntegrationStatus>>(
      async () => {
        const res = await supabase.functions.invoke("scan-health", { body: {} });
        if (res.error) return { value: { status: "offline", detail: "Função indisponível" }, ok: false, detail: res.error.message };
        const data: any = res.data;
        const lovableOk = data?.lovable_ai?.ok;
        const geminiOk = data?.gemini_direct?.ok || data?.gemini?.ok;
        if (lovableOk && geminiOk) return { value: { status: "online", detail: "Lovable AI + Gemini ativos" }, ok: true, status: 200 };
        if (lovableOk) return { value: { status: "online", detail: "Lovable AI ativo" }, ok: true, status: 200 };
        if (geminiOk) return { value: { status: "warning", detail: "Apenas Gemini direto" }, ok: false, status: 200, detail: "lovable_ai off" };
        return { value: { status: "warning", detail: "Verificar créditos / chaves" }, ok: false, status: 200, detail: "todas off" };
      },
      (e) => appendLog("ai", e),
    );
    updateOne("ai", result);
  };

  const statusIcon = (s: IntegrationStatus["status"]) => {
    switch (s) {
      case "checking": return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
      case "online": return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case "offline": return <XCircle className="h-4 w-4 text-destructive" />;
      case "warning": return <AlertCircle className="h-4 w-4 text-amber-500" />;
    }
  };

  const statusBadge = (s: IntegrationStatus["status"]) => {
    switch (s) {
      case "checking": return <Badge variant="secondary" className="text-[10px]">Verificando...</Badge>;
      case "online": return <Badge className="text-[10px] bg-green-500/10 text-green-600 border-green-200 hover:bg-green-500/20">Online</Badge>;
      case "offline": return <Badge variant="destructive" className="text-[10px]">Offline</Badge>;
      case "warning": return <Badge className="text-[10px] bg-amber-500/10 text-amber-600 border-amber-200 hover:bg-amber-500/20">Atenção</Badge>;
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between gap-2 text-base">
          <span className="flex items-center gap-2">
            <Plug className="w-5 h-5 text-primary" />
            Status das Integrações
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={runCheck}
            disabled={running}
            className="h-8 text-xs gap-1.5"
          >
            {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
            Testar agora
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {integrations.map((int) => {
          const isOpen = !!expanded[int.key];
          return (
            <div key={int.key} className="rounded-lg bg-secondary/30 border border-border/50 overflow-hidden">
              <button
                onClick={() => setExpanded((e) => ({ ...e, [int.key]: !e[int.key] }))}
                className="w-full flex items-center justify-between p-3 text-left hover:bg-secondary/50 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  {statusIcon(int.status)}
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{int.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{int.detail || int.description}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {statusBadge(int.status)}
                  {isOpen ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
                </div>
              </button>
              {isOpen && (
                <div className="px-3 pb-3 pt-1 border-t border-border/50 bg-background/40">
                  {int.logs.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground py-2">Sem logs ainda.</p>
                  ) : (
                    <ul className="space-y-1 mt-2">
                      {int.logs.map((l, i) => (
                        <li key={i} className="flex items-start gap-2 text-[11px] font-mono">
                          <span className={l.ok ? "text-green-600" : "text-destructive"}>
                            {l.ok ? "✓" : "✗"}
                          </span>
                          <span className="text-muted-foreground">{l.at}</span>
                          <span className="text-muted-foreground">tent.{l.attempt}</span>
                          <span className="text-muted-foreground">{l.ms}ms</span>
                          {l.status != null && <span className="text-muted-foreground">[{l.status}]</span>}
                          {l.detail && <span className="text-foreground/80 truncate">{l.detail}</span>}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          );
        })}
        <p className="text-[10px] text-muted-foreground pt-1">
          {lastCheck
            ? `Última verificação: ${lastCheck.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} • Auto a cada 8h • Retry com backoff (até ${MAX_ATTEMPTS}x)`
            : `Auto-verificação a cada 8h • Retry com backoff (até ${MAX_ATTEMPTS}x)`}
        </p>
      </CardContent>
    </Card>
  );
}

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle2, XCircle, AlertCircle, Plug } from "lucide-react";

interface IntegrationStatus {
  name: string;
  description: string;
  status: "checking" | "online" | "offline" | "warning";
  detail?: string;
}

const CHECK_INTERVAL_MS = 8 * 60 * 60 * 1000; // 8 horas
const LAST_CHECK_KEY = "integration_status_last_check";

export default function IntegrationStatusPanel() {
  const [integrations, setIntegrations] = useState<IntegrationStatus[]>([
    { name: "Mercado Pago", description: "Pagamentos PIX", status: "checking" },
    { name: "WhatsApp (UAZAPI)", description: "Envio de mensagens", status: "checking" },
    { name: "Google Calendar", description: "Sincronização de agenda", status: "checking" },
    { name: "Lovable AI / Gemini", description: "Escaneamento de documentos", status: "checking" },
  ]);
  const [lastCheck, setLastCheck] = useState<Date | null>(null);
  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    // Run on mount, then every 8h
    runCheck();
    intervalRef.current = window.setInterval(runCheck, CHECK_INTERVAL_MS);
    return () => {
      if (intervalRef.current) window.clearInterval(intervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runCheck = async () => {
    await checkAll();
    const now = new Date();
    setLastCheck(now);
    try { localStorage.setItem(LAST_CHECK_KEY, now.toISOString()); } catch {}
  };

  const checkAll = async () => {
    const results = await Promise.allSettled([
      checkMP(),
      checkWhatsApp(),
      checkGoogleCalendar(),
      checkAI(),
    ]);
    setIntegrations((prev) =>
      prev.map((int, i) => {
        const result = results[i];
        if (result.status === "fulfilled") return { ...int, ...result.value };
        return { ...int, status: "offline" as const, detail: "Erro na verificação" };
      })
    );
  };

  const checkMP = async (): Promise<Partial<IntegrationStatus>> => {
    try {
      const res = await supabase.functions.invoke("create-pix-payment", {
        body: { cobranca_id: "__health__", data_vencimento: "2000-01-01", valor: 0 },
      });
      if (res.error?.message?.includes("FunctionsFetchError")) {
        return { status: "offline", detail: "Função indisponível" };
      }
      const data = res.data;
      if (data?.error?.includes("Missing required")) {
        return { status: "online", detail: "Token configurado" };
      }
      if (data?.error?.includes("MERCADOPAGO_ACCESS_TOKEN")) {
        return { status: "offline", detail: "Token não configurado" };
      }
      return { status: "online", detail: "Ativo" };
    } catch {
      return { status: "offline", detail: "Erro de conexão" };
    }
  };

  const checkWhatsApp = async (): Promise<Partial<IntegrationStatus>> => {
    try {
      const res = await supabase.functions.invoke("send-whatsapp-uazapi", {
        body: { phone: "__health__", message: "" },
      });
      if (res.error?.message?.includes("FunctionsFetchError")) {
        return { status: "offline", detail: "Função indisponível" };
      }
      const data = res.data;
      if (data?.error?.includes("UAZAPI")) {
        return { status: "offline", detail: "Token não configurado" };
      }
      if (data?.error?.includes("phone") || data?.error?.includes("Missing")) {
        return { status: "online", detail: "Configurado" };
      }
      return { status: "warning", detail: data?.error || "Verificar configuração" };
    } catch {
      return { status: "offline", detail: "Erro de conexão" };
    }
  };

  const checkGoogleCalendar = async (): Promise<Partial<IntegrationStatus>> => {
    try {
      const { data, error } = await supabase
        .from("google_calendar_tokens")
        .select("id, expires_at")
        .limit(1)
        .maybeSingle();

      if (error || !data) {
        return { status: "offline", detail: "Nenhuma conta conectada" };
      }
      const expired = new Date(data.expires_at) < new Date();
      if (expired) {
        return { status: "warning", detail: "Token expirado (renova automaticamente)" };
      }
      return { status: "online", detail: "Conta conectada" };
    } catch {
      return { status: "offline", detail: "Erro ao verificar" };
    }
  };

  const checkAI = async (): Promise<Partial<IntegrationStatus>> => {
    try {
      const res = await supabase.functions.invoke("scan-health", { body: {} });
      if (res.error?.message?.includes("FunctionsFetchError")) {
        return { status: "offline", detail: "Função indisponível" };
      }
      const data: any = res.data;
      const lovableOk = data?.lovable_ai?.ok || data?.lovableAI?.ok;
      const geminiOk = data?.gemini?.ok;
      if (lovableOk && geminiOk) return { status: "online", detail: "Lovable AI + Gemini ativos" };
      if (lovableOk) return { status: "online", detail: "Lovable AI ativo" };
      if (geminiOk) return { status: "warning", detail: "Apenas Gemini direto disponível" };
      return { status: "warning", detail: "Verificar créditos / chaves" };
    } catch {
      return { status: "offline", detail: "Erro de conexão" };
    }
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
        <CardTitle className="flex items-center gap-2 text-base">
          <Plug className="w-5 h-5 text-primary" />
          Status das Integrações
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {integrations.map((int) => (
          <div key={int.name} className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 border border-border/50">
            <div className="flex items-center gap-3">
              {statusIcon(int.status)}
              <div>
                <p className="text-sm font-medium">{int.name}</p>
                <p className="text-xs text-muted-foreground">{int.detail || int.description}</p>
              </div>
            </div>
            {statusBadge(int.status)}
          </div>
        ))}
        <div className="flex items-center justify-between pt-1">
          <p className="text-[10px] text-muted-foreground">
            {lastCheck
              ? `Última verificação: ${lastCheck.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} • Auto a cada 8h`
              : "Auto-verificação a cada 8h"}
          </p>
          <button
            onClick={runCheck}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors py-1.5"
          >
            Verificar agora
          </button>
        </div>
      </CardContent>
    </Card>
  );
}

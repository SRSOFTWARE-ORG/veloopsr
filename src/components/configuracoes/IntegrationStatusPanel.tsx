import { useEffect, useState } from "react";
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

export default function IntegrationStatusPanel() {
  const [integrations, setIntegrations] = useState<IntegrationStatus[]>([
    { name: "Mercado Pago", description: "Pagamentos PIX", status: "checking" },
    { name: "WhatsApp (UAZAPI)", description: "Envio de mensagens", status: "checking" },
    { name: "n8n", description: "Automações", status: "checking" },
  ]);

  useEffect(() => {
    checkAll();
  }, []);

  const checkAll = async () => {
    const results = await Promise.allSettled([checkMP(), checkWhatsApp(), checkN8N()]);
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

  const checkN8N = async (): Promise<Partial<IntegrationStatus>> => {
    try {
      const res = await supabase.functions.invoke("send-webhook", {
        body: { event: "__health__", data: {} },
      });
      if (res.error?.message?.includes("FunctionsFetchError")) {
        return { status: "offline", detail: "Função indisponível" };
      }
      const data = res.data;
      if (data?.error?.includes("N8N_WEBHOOK_URL")) {
        return { status: "offline", detail: "URL não configurada" };
      }
      if (data?.success || data?.sent) {
        return { status: "online", detail: "Webhook ativo" };
      }
      return { status: "warning", detail: data?.error || "Verificar URL" };
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
        <button
          onClick={checkAll}
          className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors py-1.5"
        >
          Verificar novamente
        </button>
      </CardContent>
    </Card>
  );
}

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { MessageCircle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  useMaintenanceMode,
  saveMaintenance,
  isWhatsappOffline,
} from "@/hooks/useMaintenanceMode";

/**
 * Liga/desliga TODOS os envios de WhatsApp (cobranças, comprovantes, comunicados, bot).
 * O restante do app continua funcionando normalmente.
 */
const WhatsAppSwitchCard = () => {
  const { user } = useAuth();
  const { config, setConfig, loading, refresh } = useMaintenanceMode();
  const [saving, setSaving] = useState(false);

  const offline = isWhatsappOffline(config);

  const handleToggle = async (ativo: boolean) => {
    setSaving(true);
    try {
      const next = await saveMaintenance(
        config,
        { whatsapp_offline: !ativo },
        {
          action: "whatsapp",
          by: user?.email || "desconhecido",
          at: new Date().toISOString(),
          detalhe: ativo ? "WhatsApp reativado" : "WhatsApp desativado",
        },
      );
      setConfig(next);
      await refresh();
      toast.success(
        ativo
          ? "WhatsApp reativado — envios liberados"
          : "WhatsApp desativado — nenhuma mensagem será enviada",
      );
    } catch (e: any) {
      toast.error(e?.message || "Não foi possível salvar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base font-extrabold">
          <MessageCircle className="w-4 h-4" />
          WhatsApp
          <Badge variant={offline ? "destructive" : "secondary"} className="ml-auto">
            {offline ? "Desativado" : "Ativo"}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between gap-4">
          <div className="text-sm text-muted-foreground">
            Quando desativado, o app funciona normalmente, mas nenhuma mensagem de cobrança,
            comprovante ou comunicado é enviada.
          </div>
          <Switch
            checked={!offline}
            disabled={loading || saving}
            onCheckedChange={handleToggle}
            aria-label="Ativar WhatsApp"
          />
        </div>
      </CardContent>
    </Card>
  );
};

export default WhatsAppSwitchCard;

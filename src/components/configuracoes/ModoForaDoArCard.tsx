import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Power } from "lucide-react";
import { useMaintenanceMode, writeMaintenance } from "@/hooks/useMaintenanceMode";

const ModoForaDoArCard = () => {
  const { manutencao, loading, setManutencao, refresh } = useMaintenanceMode(30000);
  const [saving, setSaving] = useState(false);

  const handleToggle = async (value: boolean) => {
    setSaving(true);
    setManutencao(value);
    try {
      await writeMaintenance(value);
      await refresh();
      toast.success(value ? "App colocado fora do ar" : "App reativado — serviços liberados");
    } catch (e: any) {
      setManutencao(!value);
      toast.error(e?.message || "Não foi possível alterar o status do app");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="slide-up">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Power className={`w-4 h-4 ${manutencao ? "text-destructive" : "text-primary"}`} />
          Modo fora do ar
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-2">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <Label className="text-sm font-semibold">
              {manutencao ? "App fora do ar" : "App no ar"}
            </Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              Ao ativar, todos os outros usuários ficam bloqueados e os serviços do app são
              pausados. Somente você continua com acesso total.
            </p>
          </div>
          <Switch checked={manutencao} disabled={loading || saving} onCheckedChange={handleToggle} />
        </div>
      </CardContent>
    </Card>
  );
};

export default ModoForaDoArCard;

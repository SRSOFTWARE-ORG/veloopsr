import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Power, Clock, Users, History, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { allowPwaBypass, clearPwaBypass } from "@/lib/pwa-maintenance";
import {
  useMaintenanceMode,
  saveMaintenance,
  isScheduleActive,
  type MaintenanceAudit,
} from "@/hooks/useMaintenanceMode";

const fmt = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

const ModoForaDoArCard = () => {
  const { user } = useAuth();
  const { manutencao, config, setConfig, loading, refresh } = useMaintenanceMode();
  const [saving, setSaving] = useState(false);
  const [novoEmail, setNovoEmail] = useState("");

  const quem = user?.email || "desconhecido";
  const agendaAtiva = isScheduleActive(config);

  const persist = async (patch: Parameters<typeof saveMaintenance>[1], audit: MaintenanceAudit) => {
    setSaving(true);
    try {
      const next = await saveMaintenance(config, patch, audit);
      setConfig(next);
      await refresh();
      return true;
    } catch (e: any) {
      toast.error(e?.message || "Não foi possível salvar as configurações");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (value: boolean) => {
    const ok = await persist(
      { manutencao: value },
      { action: value ? "ativado" : "desativado", by: quem, at: new Date().toISOString() },
    );
    if (ok) {
      if (value) await allowPwaBypass();
      else await clearPwaBypass();
      // Avisa imediatamente instalações abertas/fechadas. O bloqueio não depende do envio:
      // navegação e polling continuam validando diretamente a configuração pública.
      void supabase.functions.invoke("maintenance-broadcast", { body: { active: value } });
      toast.success(value ? "App colocado fora do ar" : "App reativado — serviços liberados");
    }
  };

  const schedule = config.schedule ?? { enabled: false, start: "23:00", end: "05:00" };

  const saveSchedule = async (patch: Partial<typeof schedule>) => {
    const next = { ...schedule, ...patch };
    const ok = await persist(
      { schedule: next },
      {
        action: "agenda",
        by: quem,
        at: new Date().toISOString(),
        detalhe: next.enabled
          ? `Agendamento ligado (${next.start} → ${next.end})`
          : "Agendamento desligado",
      },
    );
    if (ok) toast.success("Agendamento atualizado");
  };

  const addBypass = async () => {
    const email = novoEmail.trim().toLowerCase();
    if (!email || !email.includes("@")) return toast.error("Informe um e-mail válido");
    const list = config.bypass_emails ?? [];
    if (list.map((e) => e.toLowerCase()).includes(email)) return toast.error("E-mail já liberado");
    const ok = await persist(
      { bypass_emails: [...list, email] },
      { action: "bypass", by: quem, at: new Date().toISOString(), detalhe: `Liberado: ${email}` },
    );
    if (ok) {
      setNovoEmail("");
      toast.success("Acesso liberado durante manutenção");
    }
  };

  const removeBypass = async (email: string) => {
    const ok = await persist(
      { bypass_emails: (config.bypass_emails ?? []).filter((e) => e !== email) },
      { action: "bypass", by: quem, at: new Date().toISOString(), detalhe: `Removido: ${email}` },
    );
    if (ok) toast.success("Acesso removido");
  };

  return (
    <Card className="slide-up">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Power className={`w-4 h-4 ${manutencao ? "text-destructive" : "text-primary"}`} />
          Modo fora do ar
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-2 space-y-5">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <Label className="text-sm font-semibold">
              {manutencao ? "App fora do ar" : "App no ar"}
            </Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              Ao ativar, os outros usuários ficam bloqueados e filas, jobs e webhooks de
              vendas/atualizações são pausados. Tudo retorna automaticamente ao desativar.
            </p>
            {agendaAtiva && (
              <Badge variant="secondary" className="mt-2 text-[10px]">
                Ativo pelo agendamento
              </Badge>
            )}
          </div>
          <Switch
            checked={config.manutencao}
            disabled={loading || saving}
            onCheckedChange={handleToggle}
          />
        </div>

        {/* Agendamento */}
        <div className="space-y-3 border-t border-border pt-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-muted-foreground" />
              <Label className="text-sm font-semibold">Agendar automaticamente</Label>
            </div>
            <Switch
              checked={schedule.enabled}
              disabled={saving}
              onCheckedChange={(v) => void saveSchedule({ enabled: v })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">Ativar às</Label>
              <Input
                type="time"
                value={schedule.start}
                disabled={saving}
                onChange={(e) => setConfig({ ...config, schedule: { ...schedule, start: e.target.value } })}
                onBlur={(e) => void saveSchedule({ start: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Desativar às</Label>
              <Input
                type="time"
                value={schedule.end}
                disabled={saving}
                onChange={(e) => setConfig({ ...config, schedule: { ...schedule, end: e.target.value } })}
                onBlur={(e) => void saveSchedule({ end: e.target.value })}
              />
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Horário de Brasília. Janelas que passam da meia-noite são suportadas.
          </p>
        </div>

        {/* Bypass */}
        <div className="space-y-3 border-t border-border pt-4">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-muted-foreground" />
            <Label className="text-sm font-semibold">Acesso liberado na manutenção</Label>
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="email@exemplo.com"
              value={novoEmail}
              disabled={saving}
              onChange={(e) => setNovoEmail(e.target.value)}
            />
            <Button size="sm" disabled={saving} onClick={() => void addBypass()}>
              Liberar
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {(config.bypass_emails ?? []).length === 0 && (
              <p className="text-xs text-muted-foreground">Somente você tem acesso.</p>
            )}
            {(config.bypass_emails ?? []).map((email) => (
              <Badge key={email} variant="secondary" className="gap-1 text-[11px]">
                {email}
                <button onClick={() => void removeBypass(email)} disabled={saving}>
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            ))}
          </div>
        </div>

        {/* Auditoria */}
        <div className="space-y-2 border-t border-border pt-4">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-muted-foreground" />
            <Label className="text-sm font-semibold">Histórico de alterações</Label>
          </div>
          <div className="max-h-48 overflow-y-auto space-y-1">
            {(config.audit ?? []).length === 0 && (
              <p className="text-xs text-muted-foreground">Nenhuma alteração registrada.</p>
            )}
            {(config.audit ?? []).map((a, i) => (
              <div key={i} className="text-xs flex flex-col border border-border rounded-lg px-3 py-2">
                <span className="font-semibold capitalize">
                  {a.action} {a.detalhe ? `— ${a.detalhe}` : ""}
                </span>
                <span className="text-muted-foreground">
                  {a.by} • {fmt(a.at)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default ModoForaDoArCard;

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { KeyRound, ShieldAlert, Power, LogIn, Loader2 } from "lucide-react";
import { useAuth, FOUNDER_EMAIL } from "@/contexts/AuthContext";
import {
  appendMaintenanceAudit,
  canBypass,
  isMaintenanceActive,
  readMaintenanceConfig,
  saveMaintenance,
  type MaintenanceConfig,
} from "@/hooks/useMaintenanceMode";
import { allowPwaBypass, clearPwaBypass } from "@/lib/pwa-maintenance";
import { resilientSignIn } from "@/lib/resilient-auth";


/**
 * Aba alternativa de acesso durante o modo "fora do ar".
 * - Fica FORA do MaintenanceGate, então continua acessível com o app bloqueado.
 * - Usuários liberados entram no app, mas os serviços permanecem pausados.
 * - Somente o fundador pode reativar o app (desligar o modo fora do ar) por aqui.
 */
const AcessoAlternativoPage = () => {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();

  const [config, setConfig] = useState<MaintenanceConfig | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [working, setWorking] = useState(false);

  const refresh = async () => setConfig(await readMaintenanceConfig());

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), 15000);
    return () => window.clearInterval(id);
  }, []);

  const manutencao = isMaintenanceActive(config);
  const currentEmail = user?.email?.toLowerCase() ?? null;
  const isFounder = currentEmail === FOUNDER_EMAIL;
  const liberado = isFounder || canBypass(config, currentEmail);

  const finalizeLogin = async (loggedEmail: string) => {
    const logged = loggedEmail.toLowerCase();
    const cfg = await readMaintenanceConfig();
    setConfig(cfg);

    const ok = logged === FOUNDER_EMAIL || canBypass(cfg, logged);
    void appendMaintenanceAudit({
      action: "acesso",
      by: logged || email,
      at: new Date().toISOString(),
      detalhe: ok ? "Login pela aba alternativa" : "Tentativa negada na aba alternativa",
    });

    if (!ok) {
      await supabase.auth.signOut();
      toast.error("Este usuário não está liberado durante a manutenção.");
      return;
    }
    toast.success("Acesso liberado — serviços seguem pausados.");
  };

  const attemptLogin = async () => {
    const result = await resilientSignIn(email, password, {
      onAttempt: (n) => setTentativa(n),
    });

    if (result.ok && result.email) {
      setReconectando(false);
      await finalizeLogin(result.email);
      return true;
    }

    if (result.backendDown) {
      setReconectando(true);
      toast.error(result.error || "Servidor indisponível — tentando novamente…");
    } else {
      setReconectando(false);
      toast.error(result.error || "Não foi possível entrar");
    }
    return false;
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await attemptLogin();
    } finally {
      setLoading(false);
    }
  };

  // Enquanto o servidor estiver fora, a aba /acesso continua tentando sozinha.
  useEffect(() => {
    if (!reconectando || user) return;
    const id = window.setInterval(() => {
      if (!email || !password) return;
      void attemptLogin();
    }, 10000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reconectando, user, email, password]);


  const entrarNoApp = () => {
    // Não bloqueia a navegação: o aviso ao service worker é best-effort.
    void allowPwaBypass();
    navigate("/", { replace: true });
  };

  const reativarApp = async () => {
    if (!isFounder) return;
    setWorking(true);
    try {
      const current = await readMaintenanceConfig();
      const next = await saveMaintenance(
        current,
        { manutencao: false, schedule: { ...(current.schedule ?? { start: "23:00", end: "05:00", enabled: false }), enabled: false } },
        {
          action: "desativado",
          by: currentEmail || FOUNDER_EMAIL,
          at: new Date().toISOString(),
          detalhe: "Reativado pela aba de acesso alternativo (agendamento desligado)",
        },
      );
      setConfig(next);
      await clearPwaBypass();
      toast.success("App reativado — serviços retomados.");
      navigate("/", { replace: true });
    } catch (err: any) {
      toast.error(err?.message || "Falha ao reativar o app");
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6 py-10">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <div className="w-14 h-14 rounded-2xl bg-secondary flex items-center justify-center mx-auto">
            <KeyRound className="w-7 h-7 text-primary" />
          </div>
          <h1 className="text-xl font-extrabold tracking-tight">Acesso alternativo</h1>
          <p className="text-sm text-muted-foreground">
            Entrada de emergência para usuários liberados durante a manutenção.
          </p>
          <Badge variant={manutencao ? "destructive" : "secondary"} className="text-[11px]">
            {manutencao ? "App fora do ar" : "App no ar"}
          </Badge>
        </div>

        {!user ? (
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">E-mail</Label>
              <Input
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Senha</Label>
              <Input
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
              Entrar
            </Button>
          </form>
        ) : liberado ? (
          <div className="space-y-3">
            <div className="rounded-xl border border-border p-4 text-sm">
              <p className="font-semibold">{user.email}</p>
              <p className="text-muted-foreground text-xs mt-1">
                {isFounder
                  ? "Fundador — você pode reativar o app e retomar todos os serviços."
                  : "Acesso liberado. Os serviços automáticos continuam pausados até o fundador reativar o app."}
              </p>
            </div>

            {isFounder && manutencao && (
              <Button className="w-full" disabled={working} onClick={() => void reativarApp()}>
                {working ? <Loader2 className="w-4 h-4 animate-spin" /> : <Power className="w-4 h-4" />}
                Reativar app agora
              </Button>
            )}

            <Button variant="outline" className="w-full" onClick={() => void entrarNoApp()}>
              Entrar no app
            </Button>
            <Button variant="ghost" size="sm" className="w-full" onClick={() => void signOut()}>
              Sair
            </Button>
          </div>
        ) : (
          <div className="space-y-3 text-center">
            <ShieldAlert className="w-8 h-8 text-destructive mx-auto" />
            <p className="text-sm text-muted-foreground">
              {user.email} não está liberado durante a manutenção.
            </p>
            <Button variant="outline" className="w-full" onClick={() => void signOut()}>
              Sair
            </Button>
          </div>
        )}

        <p className="text-[11px] text-muted-foreground text-center">
          Todos os acessos por esta aba são registrados na auditoria.
        </p>
      </div>
    </div>
  );
};

export default AcessoAlternativoPage;

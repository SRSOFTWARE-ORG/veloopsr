import React, { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useAuth, FOUNDER_EMAIL } from "@/contexts/AuthContext";
import { useMaintenanceMode, canBypass } from "@/hooks/useMaintenanceMode";
import { allowPwaBypass, clearPwaBypass } from "@/lib/pwa-maintenance";
import { Wrench, PauseCircle } from "lucide-react";

/**
 * Bloqueia todo o app quando o modo "fora do ar" está ativo.
 * O CEO fundador e os e-mails liberados no bypass continuam com acesso normal,
 * porém com aviso de que os serviços automáticos seguem pausados.
 */
const MaintenanceGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, signOut } = useAuth();
  const { manutencao, config, loading } = useMaintenanceMode();

  const isFounder = user?.email?.toLowerCase() === FOUNDER_EMAIL;
  const liberado = isFounder || canBypass(config, user?.email);

  // Mantém o service worker (PWA, mesmo desatualizado) alinhado ao estado atual.
  useEffect(() => {
    if (loading) return;
    if (manutencao && liberado) void allowPwaBypass();
    if (!manutencao) void clearPwaBypass();
  }, [loading, manutencao, liberado]);

  if (loading || !manutencao) {
    return <>{children}</>;
  }

  if (liberado) {
    return (
      <>
        <div className="sticky top-0 z-50 flex items-center gap-2 bg-destructive/10 text-destructive px-4 py-2 text-xs font-semibold">
          <PauseCircle className="w-4 h-4 shrink-0" />
          <span className="truncate">
            Modo fora do ar ativo — serviços automáticos pausados
            {isFounder ? "" : " até o administrador reativar"}.
          </span>
        </div>
        {children}
      </>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-8 text-center bg-background">
      <div className="w-16 h-16 rounded-2xl bg-secondary flex items-center justify-center">
        <Wrench className="w-8 h-8 text-muted-foreground" />
      </div>
      <h1 className="text-xl font-extrabold tracking-tight">App temporariamente fora do ar</h1>
      <p className="text-sm text-muted-foreground max-w-sm">
        Os serviços foram pausados pelo administrador para manutenção. Tente novamente em alguns
        instantes — o acesso volta automaticamente assim que for reativado.
      </p>
      {user && (
        <Button variant="ghost" size="sm" onClick={() => void signOut()}>
          Sair
        </Button>
      )}
    </div>
  );
};

export default MaintenanceGate;

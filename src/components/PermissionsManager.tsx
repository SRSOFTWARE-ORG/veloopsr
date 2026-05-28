import { useDevicePermissions, PermissionStatus } from "@/hooks/useDevicePermissions";
import { Bell, Camera, Mic, MapPin, FolderOpen, CheckCircle2, XCircle, AlertCircle, Shield } from "lucide-react";

const iconMap: Record<string, React.ElementType> = {
  Bell, Camera, Mic, MapPin, FolderOpen,
};

const stateConfig: Record<PermissionStatus["state"], { label: string; color: string; Icon: React.ElementType }> = {
  granted: { label: "Permitido", color: "text-green-500", Icon: CheckCircle2 },
  denied: { label: "Bloqueado", color: "text-destructive", Icon: XCircle },
  prompt: { label: "Pendente", color: "text-yellow-500", Icon: AlertCircle },
  unsupported: { label: "Indisponível", color: "text-muted-foreground", Icon: XCircle },
};

const PermissionsManager = () => {
  const { permissions, requestAll } = useDevicePermissions();

  const hasPending = permissions.some((p) => p.state === "prompt");

  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-primary" />
          <h3 className="text-sm font-semibold">Permissões do Dispositivo</h3>
        </div>
        {hasPending && (
          <button
            onClick={requestAll}
            className="text-xs bg-primary text-primary-foreground px-3 py-1.5 rounded-lg font-medium hover:bg-primary/90 transition-colors"
          >
            Permitir Todas
          </button>
        )}
      </div>

      <div className="space-y-1.5">
        {permissions.map((perm) => {
          const PermIcon = iconMap[perm.icon] || Bell;
          const { label, color, Icon: StatusIcon } = stateConfig[perm.state] || stateConfig.unsupported;

          return (
            <div
              key={perm.name}
              className="flex items-center justify-between py-2 px-2.5 rounded-lg hover:bg-secondary/50 transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <PermIcon className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm">{perm.label}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs font-medium ${color}`}>{label}</span>
                {perm.state === "prompt" ? (
                  <button
                    onClick={perm.request}
                    className="text-xs bg-primary/10 text-primary px-2.5 py-1 rounded-md font-medium hover:bg-primary/20 transition-colors"
                  >
                    Ativar
                  </button>
                ) : perm.state === "denied" ? (
                  <button
                    onClick={() => {
                      if (perm.name === "notifications") {
                        alert("Para desbloquear:\n\n📱 Celular: Toque no ícone de cadeado/info na barra de endereço → Permissões → Notificações → Permitir\n\n💻 Desktop: Clique no cadeado ao lado da URL → Permissões do site → Notificações → Permitir\n\nDepois recarregue a página.");
                      }
                    }}
                    className="text-xs bg-destructive/10 text-destructive px-2.5 py-1 rounded-md font-medium hover:bg-destructive/20 transition-colors"
                  >
                    Desbloquear
                  </button>
                ) : (
                  <StatusIcon className={`w-4 h-4 ${color}`} />
                )}
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-[11px] text-muted-foreground mt-2">
        Se uma permissão estiver bloqueada, acesse as configurações do navegador para alterá-la.
      </p>
    </div>
  );
};

export default PermissionsManager;

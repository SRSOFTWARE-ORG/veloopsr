import { Cloud, CloudOff, RefreshCw } from "lucide-react";
import type { ConnectionStatus } from "@/hooks/useOnlineStatus";

interface Props {
  status: ConnectionStatus;
  pendingCount: number;
}

const config: Record<ConnectionStatus, { icon: typeof Cloud; label: string; className: string }> = {
  online: { icon: Cloud, label: "Online", className: "text-emerald-600 bg-emerald-50" },
  offline: { icon: CloudOff, label: "Modo Offline", className: "text-amber-600 bg-amber-50" },
  syncing: { icon: RefreshCw, label: "Sincronizando…", className: "text-blue-600 bg-blue-50" },
};

const ConnectionStatusIndicator = ({ status, pendingCount }: Props) => {
  const { icon: Icon, label, className } = config[status];

  return (
    <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${className} transition-all duration-300`}>
      <Icon className={`w-3.5 h-3.5 ${status === "syncing" ? "animate-spin" : ""}`} />
      <span>{label}</span>
      {pendingCount > 0 && (
        <span className="ml-0.5 bg-current/15 rounded-full px-1.5 py-0.5 text-[10px] font-bold">
          {pendingCount}
        </span>
      )}
    </div>
  );
};

export default ConnectionStatusIndicator;

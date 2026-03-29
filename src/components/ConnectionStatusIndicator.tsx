import { Cloud, CloudOff, RefreshCw } from "lucide-react";
import type { ConnectionStatus } from "@/hooks/useOnlineStatus";

interface Props {
  status: ConnectionStatus;
  pendingCount: number;
}

const config: Record<ConnectionStatus, { icon: typeof Cloud; label: string }> = {
  online: { icon: Cloud, label: "Online" },
  offline: { icon: CloudOff, label: "Modo Offline" },
  syncing: { icon: RefreshCw, label: "Sincronizando" },
};

const colorMap: Record<ConnectionStatus, string> = {
  online: "text-emerald-500",
  offline: "text-amber-500",
  syncing: "text-blue-500",
};

const ConnectionStatusIndicator = ({ status, pendingCount }: Props) => {
  const { icon: Icon, label } = config[status];

  return (
    <div className="fixed top-4 right-4 z-50 flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/80 backdrop-blur-md border border-gray-100 shadow-sm transition-all duration-300">
      <Icon className={`w-3.5 h-3.5 ${colorMap[status]} ${status === "syncing" ? "animate-spin" : ""}`} />
      <span className={`text-[10px] font-medium uppercase tracking-wider ${status === "offline" ? "text-amber-600" : "text-gray-600"}`}>
        {label}
      </span>
      {pendingCount > 0 && (
        <span className="text-[9px] font-bold text-blue-600 bg-blue-100 rounded-full px-1.5">
          {pendingCount}
        </span>
      )}
    </div>
  );
};

export default ConnectionStatusIndicator;

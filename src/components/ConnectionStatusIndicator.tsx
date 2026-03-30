import { useState, useEffect, useRef } from "react";
import { Cloud, CloudOff, RefreshCw, Download } from "lucide-react";
import type { ConnectionStatus } from "@/hooks/useOnlineStatus";
import { toast } from "sonner";

interface Props {
  status: ConnectionStatus;
  pendingCount: number;
  onForceSync?: () => Promise<void>;
  sidebarOpen?: boolean;
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

const ConnectionStatusIndicator = ({ status, pendingCount, onForceSync, sidebarOpen }: Props) => {
  const { icon: Icon, label } = config[status];
  const [expanded, setExpanded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on any outside click
  useEffect(() => {
    if (!expanded) return;
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setExpanded(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [expanded]);

  const handleForceSync = async () => {
    if (!onForceSync || status === "syncing") return;
    toast.info("Forçando sincronização…");
    await onForceSync();
    setExpanded(false);
  };

  const handleExportCSV = async () => {
    try {
      const { supabase } = await import("@/integrations/supabase/client");
      const [{ data: cobrancas }, { data: pagamentos }] = await Promise.all([
        supabase.from("cobrancas").select("*"),
        supabase.from("cobranca_pagamentos").select("*"),
      ]);
      const pagMap = new Map<string, any[]>();
      (pagamentos || []).forEach((p) => {
        const arr = pagMap.get(p.cobranca_id) || [];
        arr.push(p);
        pagMap.set(p.cobranca_id, arr);
      });
      const rows: string[] = [
        "Cliente,Valor Parcela,Frequência,Data Início,Data Fim,Vencimento,Status Parcela,Pago Em",
      ];
      (cobrancas || []).forEach((c) => {
        const pags = pagMap.get(c.id) || [];
        if (pags.length === 0) {
          rows.push(`"${c.cliente_nome}",${c.valor_parcela},"${c.frequencia}","${c.data_inicio}","${c.data_fim}","","",""`);
        } else {
          pags.forEach((p) => {
            rows.push(`"${c.cliente_nome}",${c.valor_parcela},"${c.frequencia}","${c.data_inicio}","${c.data_fim}","${p.data_vencimento}","${p.status}","${p.pago_em || ""}"`);
          });
        }
      });
      const csv = rows.join("\n");
      const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `veloop_relatorio_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Relatório exportado com sucesso!");
      setExpanded(false);
    } catch (err) {
      console.error("Export error:", err);
      toast.error("Erro ao exportar relatório");
    }
  };

  return (
    <div
      ref={containerRef}
      className="fixed top-[18px] left-1/2 -translate-x-1/2 md:left-auto md:translate-x-0 md:right-4 md:top-4 z-50 flex flex-col items-center md:items-end gap-1"
    >
      {/* Main pill */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/80 backdrop-blur-md border border-gray-100 shadow-sm transition-all duration-150 hover:shadow-md active:scale-95"
      >
        <Icon className={`w-3.5 h-3.5 ${colorMap[status]} ${status === "syncing" ? "animate-spin" : ""}`} />
        {/* Hide label when mobile sidebar is open */}
        {!sidebarOpen && (
          <span className={`text-[10px] font-medium uppercase tracking-wider ${status === "offline" ? "text-amber-600" : "text-gray-600"}`}>
            {label}
          </span>
        )}
        {pendingCount > 0 && (
          <span className="text-[9px] font-bold text-blue-600 bg-blue-100 rounded-full px-1.5">
            {pendingCount}
          </span>
        )}
      </button>

      {/* Expanded actions */}
      {expanded && (
        <div className="flex flex-col gap-1 bg-white/90 backdrop-blur-md border border-gray-100 rounded-xl shadow-lg p-2 min-w-[180px] animate-in fade-in slide-in-from-top-2 duration-200">
          <button
            onClick={handleForceSync}
            disabled={status === "syncing" || (!navigator.onLine && pendingCount === 0)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${status === "syncing" ? "animate-spin text-blue-500" : "text-gray-500"}`} />
            Sincronizar Agora
            {pendingCount > 0 && (
              <span className="ml-auto text-[9px] font-bold text-blue-600 bg-blue-50 rounded-full px-1.5 py-0.5">
                {pendingCount}
              </span>
            )}
          </button>
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <Download className="w-3.5 h-3.5 text-gray-500" />
            Exportar Relatório CSV
          </button>
        </div>
      )}
    </div>
  );
};

export default ConnectionStatusIndicator;

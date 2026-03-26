import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { CalendarSync, Unplug, Upload, Download } from "lucide-react";

const GoogleCalendarSync = () => {
  const { user } = useAuth();
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const connectedRef = useRef(false);

  const checkStatus = useCallback(async () => {
    if (!user) return;
    try {
      const { data } = await supabase.functions.invoke("google-calendar-sync", {
        body: { action: "status", user_id: user.id },
      });
      const isConnected = !!data?.connected;
      setConnected(isConnected);
      connectedRef.current = isConnected;
    } catch {
      setConnected(false);
      connectedRef.current = false;
    }
  }, [user]);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  // Auto-export on first load (only new/unsynced)
  useEffect(() => {
    if (!connected || !user) return;
    supabase.functions.invoke("google-calendar-sync", {
      body: { action: "export", user_id: user.id },
    }).then(({ data }) => {
      if (data?.events_created > 0) {
        toast.success(`${data.events_created} novos eventos sincronizados`);
      }
    }).catch(() => {});
  }, [connected, user]);

  // Realtime: listen for cobrancas changes and auto-sync
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel("cobrancas-gcal-sync")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "cobrancas" },
        async (payload) => {
          if (!connectedRef.current) return;

          if (payload.eventType === "DELETE" && payload.old) {
            await supabase.functions.invoke("google-calendar-sync", {
              body: { action: "delete_cobranca", user_id: user.id, cobranca_id: (payload.old as any).id },
            });
          } else if (payload.eventType === "INSERT" && payload.new) {
            await supabase.functions.invoke("google-calendar-sync", {
              body: { action: "sync_cobranca", user_id: user.id, cobranca_id: (payload.new as any).id },
            });
          } else if (payload.eventType === "UPDATE" && payload.new) {
            await supabase.functions.invoke("google-calendar-sync", {
              body: { action: "sync_cobranca", user_id: user.id, cobranca_id: (payload.new as any).id },
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const handleConnect = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const redirectUri = `${window.location.origin}/agenda`;
      const { data, error } = await supabase.functions.invoke("google-calendar-auth", {
        body: { redirect_uri: redirectUri },
      });
      if (error) throw error;
      if (!data?.url) throw new Error("No auth URL returned");
      sessionStorage.setItem("gcal_user_id", user.id);
      sessionStorage.setItem("gcal_redirect_uri", redirectUri);
      window.location.href = data.url;
    } catch (err: any) {
      toast.error("Erro ao conectar: " + (err.message || "Tente novamente"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const userId = sessionStorage.getItem("gcal_user_id");
    const redirectUri = sessionStorage.getItem("gcal_redirect_uri");

    if (code && userId && redirectUri) {
      window.history.replaceState({}, "", window.location.pathname);
      sessionStorage.removeItem("gcal_user_id");
      sessionStorage.removeItem("gcal_redirect_uri");

      (async () => {
        setLoading(true);
        try {
          const { error } = await supabase.functions.invoke("google-calendar-callback", {
            body: { code, redirect_uri: redirectUri, user_id: userId },
          });
          if (error) throw error;
          setConnected(true);
          connectedRef.current = true;
          toast.success("Google Calendar conectado!");
        } catch (err: any) {
          toast.error("Erro no callback: " + (err.message || "Tente novamente"));
        } finally {
          setLoading(false);
        }
      })();
    }
  }, []);

  const handleSync = async (action: "export" | "import") => {
    if (!user) return;
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("google-calendar-sync", {
        body: { action, user_id: user.id },
      });
      if (error) throw error;
      if (action === "export") {
        toast.success(`${data?.events_created || 0} eventos exportados`);
      } else {
        toast.success(`${data?.events?.length || 0} eventos encontrados`);
      }
    } catch (err: any) {
      toast.error("Erro: " + (err.message || "Tente novamente"));
    } finally {
      setSyncing(false);
    }
  };

  const handleDisconnect = async () => {
    if (!user) return;
    setLoading(true);
    try {
      await supabase.functions.invoke("google-calendar-sync", {
        body: { action: "disconnect", user_id: user.id },
      });
      setConnected(false);
      connectedRef.current = false;
      toast.success("Google Calendar desconectado");
    } catch {
      toast.error("Erro ao desconectar");
    } finally {
      setLoading(false);
    }
  };

  if (!connected) {
    return (
      <Button variant="outline" size="sm" onClick={handleConnect} disabled={loading} className="gap-2">
        <CalendarSync className="w-4 h-4" />
        {loading ? "Conectando..." : "Google Calendar"}
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <Button variant="outline" size="sm" onClick={() => handleSync("export")} disabled={syncing} className="gap-1.5" title="Exportar cobranças">
        <Upload className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Exportar</span>
      </Button>
      <Button variant="outline" size="sm" onClick={() => handleSync("import")} disabled={syncing} className="gap-1.5" title="Importar eventos">
        <Download className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Importar</span>
      </Button>
      <Button variant="ghost" size="icon" onClick={handleDisconnect} disabled={loading} className="h-8 w-8" title="Desconectar">
        <Unplug className="w-3.5 h-3.5 text-muted-foreground" />
      </Button>
    </div>
  );
};

export default GoogleCalendarSync;

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { CalendarSync, Unplug, RefreshCw, Download, Upload } from "lucide-react";

const GoogleCalendarSync = () => {
  const { user } = useAuth();
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [autoExported, setAutoExported] = useState(false);

  const checkStatus = useCallback(async () => {
    if (!user) return;
    try {
      const { data } = await supabase.functions.invoke("google-calendar-sync", {
        body: { action: "status", user_id: user.id },
      });
      setConnected(!!data?.connected);
      return !!data?.connected;
    } catch {
      setConnected(false);
      return false;
    }
  }, [user]);

  // Auto-export when connected
  const autoExport = useCallback(async () => {
    if (!user || autoExported) return;
    try {
      const { data, error } = await supabase.functions.invoke("google-calendar-sync", {
        body: { action: "export", user_id: user.id },
      });
      if (!error && data?.events_created > 0) {
        toast.success(`${data.events_created} eventos exportados automaticamente`);
      }
    } catch {
      // Silent fail for auto-export
    }
    setAutoExported(true);
  }, [user, autoExported]);

  useEffect(() => {
    checkStatus().then((isConnected) => {
      if (isConnected) autoExport();
    });
  }, [checkStatus, autoExport]);

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

      // Store user_id and redirect_uri for callback
      sessionStorage.setItem("gcal_user_id", user.id);
      sessionStorage.setItem("gcal_redirect_uri", redirectUri);

      // Redirect to Google OAuth
      window.location.href = data.url;
    } catch (err: any) {
      toast.error("Erro ao conectar: " + (err.message || "Tente novamente"));
    } finally {
      setLoading(false);
    }
  };

  // Handle OAuth callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const userId = sessionStorage.getItem("gcal_user_id");
    const redirectUri = sessionStorage.getItem("gcal_redirect_uri");

    if (code && userId && redirectUri) {
      // Clean URL
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
        toast.success(`${data?.events_created || 0} eventos exportados para o Google Calendar`);
      } else {
        toast.success(`${data?.events?.length || 0} eventos encontrados no Google Calendar`);
      }
    } catch (err: any) {
      toast.error("Erro na sincronização: " + (err.message || "Tente novamente"));
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
      toast.success("Google Calendar desconectado");
    } catch {
      toast.error("Erro ao desconectar");
    } finally {
      setLoading(false);
    }
  };

  if (!connected) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={handleConnect}
        disabled={loading}
        className="gap-2"
      >
        <CalendarSync className="w-4 h-4" />
        {loading ? "Conectando..." : "Google Calendar"}
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <Button
        variant="outline"
        size="sm"
        onClick={() => handleSync("export")}
        disabled={syncing}
        className="gap-1.5"
        title="Exportar cobranças para o Google Calendar"
      >
        <Upload className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Exportar</span>
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={() => handleSync("import")}
        disabled={syncing}
        className="gap-1.5"
        title="Importar eventos do Google Calendar"
      >
        <Download className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Importar</span>
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={handleDisconnect}
        disabled={loading}
        className="h-8 w-8"
        title="Desconectar Google Calendar"
      >
        <Unplug className="w-3.5 h-3.5 text-muted-foreground" />
      </Button>
    </div>
  );
};

export default GoogleCalendarSync;

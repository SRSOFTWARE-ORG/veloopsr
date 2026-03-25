import { useState, useEffect } from "react";
import { Bell, BellRing, Check, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Notificacao {
  id: string;
  titulo: string;
  mensagem: string;
  tipo: string;
  lida: boolean;
  dados: any;
  created_at: string;
}

const NotificationBell = () => {
  const { user } = useAuth();
  const [notificacoes, setNotificacoes] = useState<Notificacao[]>([]);
  const {
    isSupported: pushSupported,
    isSubscribed: pushSubscribed,
    subscribe: pushSubscribe,
    unsubscribe: pushUnsubscribe,
  } = usePushNotifications();
  const [open, setOpen] = useState(false);

  const unreadCount = notificacoes.filter((n) => !n.lida).length;

  useEffect(() => {
    if (!user) return;

    const fetchNotificacoes = async () => {
      const { data } = await supabase
        .from("notificacoes")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(20);
      if (data) setNotificacoes(data as Notificacao[]);
    };

    fetchNotificacoes();

    const channel = supabase
      .channel("notificacoes-realtime")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notificacoes",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          setNotificacoes((prev) => [payload.new as Notificacao, ...prev]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const markAllRead = async () => {
    if (!user || unreadCount === 0) return;
    await supabase
      .from("notificacoes")
      .update({ lida: true })
      .eq("user_id", user.id)
      .eq("lida", false);
    setNotificacoes((prev) => prev.map((n) => ({ ...n, lida: true })));
  };

  const clearAll = async () => {
    if (!user) return;
    await supabase.from("notificacoes").delete().eq("user_id", user.id);
    setNotificacoes([]);
    setOpen(false);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 rounded-full hover:bg-secondary/60 transition-colors active:scale-95"
      >
        <Bell className="w-5 h-5 text-muted-foreground" />
        {unreadCount > 0 && (
          <span className="absolute top-0.5 right-0.5 w-4.5 h-4.5 bg-destructive text-destructive-foreground text-[9px] font-bold rounded-full flex items-center justify-center shadow-sm">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="fixed md:absolute right-2 md:right-0 top-14 md:top-full md:mt-2 w-[calc(100vw-1rem)] md:w-80 max-h-[28rem] bg-card/95 backdrop-blur-xl border border-border/40 rounded-2xl shadow-2xl z-50 overflow-hidden">
            {/* Header */}
            <div className="px-4 pt-4 pb-2.5">
              <h3 className="text-base font-semibold tracking-tight">Notificações</h3>
            </div>

            {/* Push toggle */}
            {pushSupported && (
              <div className="mx-3 mb-2 px-3.5 py-2.5 bg-secondary/50 rounded-xl flex items-center justify-between">
                <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <BellRing className="w-3.5 h-3.5" />
                  Push no celular
                </span>
                <button
                  onClick={() =>
                    pushSubscribed ? pushUnsubscribe() : pushSubscribe()
                  }
                  className={`text-xs px-3 py-1 rounded-full font-medium transition-all ${
                    pushSubscribed
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "bg-secondary text-muted-foreground hover:bg-secondary/80"
                  }`}
                >
                  {pushSubscribed ? "Ativado" : "Ativar"}
                </button>
              </div>
            )}

            {/* Actions */}
            {notificacoes.length > 0 && (
              <div className="flex items-center gap-2 px-4 pb-2">
                {unreadCount > 0 && (
                  <button
                    onClick={markAllRead}
                    className="flex items-center gap-1 text-[11px] text-primary font-medium hover:text-primary/80 transition-colors"
                  >
                    <Check className="w-3 h-3" />
                    Marcar lidas
                  </button>
                )}
                <button
                  onClick={clearAll}
                  className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-destructive transition-colors ml-auto"
                >
                  <Trash2 className="w-3 h-3" />
                  Limpar
                </button>
              </div>
            )}

            {/* Divider */}
            <div className="h-px bg-border/40 mx-3" />

            {/* List */}
            <div className="overflow-y-auto max-h-72 py-1.5">
              {notificacoes.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 px-4">
                  <Bell className="w-8 h-8 text-muted-foreground/30 mb-2" />
                  <p className="text-sm text-muted-foreground">
                    Nenhuma notificação
                  </p>
                </div>
              ) : (
                notificacoes.map((n) => (
                  <div
                    key={n.id}
                    className={`mx-2 mb-1 px-3 py-2.5 rounded-xl transition-colors ${
                      !n.lida
                        ? "bg-primary/5"
                        : "hover:bg-secondary/40"
                    }`}
                  >
                    <div className="flex items-start gap-2.5">
                      {!n.lida && (
                        <span className="w-2 h-2 rounded-full bg-primary mt-1.5 shrink-0 shadow-sm shadow-primary/30" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-semibold leading-tight">
                          {n.titulo}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                          {n.mensagem}
                        </p>
                        <p className="text-[10px] text-muted-foreground/60 mt-1">
                          {formatDistanceToNow(new Date(n.created_at), {
                            addSuffix: true,
                            locale: ptBR,
                          })}
                        </p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default NotificationBell;

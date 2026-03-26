import { useState, useEffect, useRef, useCallback } from "react";
import { Bell, BellRing, Check, Trash2, Volume2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { motion, AnimatePresence, useMotionValue, useTransform, PanInfo } from "framer-motion";

interface Notificacao {
  id: string;
  titulo: string;
  mensagem: string;
  tipo: string;
  lida: boolean;
  dados: any;
  created_at: string;
}

const SwipeToDelete = ({
  children,
  onDelete,
}: {
  children: React.ReactNode;
  onDelete: () => void;
}) => {
  const x = useMotionValue(0);
  const opacity = useTransform(x, [-120, -60, 0, 60, 120], [0.3, 0.8, 1, 0.8, 0.3]);
  const bg = useTransform(
    x,
    [-100, 0, 100],
    ["hsl(0 84% 60%)", "transparent", "hsl(0 84% 60%)"]
  );

  const handleDragEnd = (_: any, info: PanInfo) => {
    if (Math.abs(info.offset.x) > 100) {
      onDelete();
    }
  };

  return (
    <div className="relative overflow-hidden rounded-xl mx-2 mb-1">
      <motion.div
        className="absolute inset-0 flex items-center justify-center rounded-xl"
        style={{ backgroundColor: bg }}
      >
        <Trash2 className="w-4 h-4 text-white" />
      </motion.div>
      <motion.div
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.4}
        onDragEnd={handleDragEnd}
        style={{ x, opacity }}
        className="relative z-10 bg-card rounded-xl"
      >
        {children}
      </motion.div>
    </div>
  );
};

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
  const [testCountdown, setTestCountdown] = useState<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const hasInteracted = useRef(false);

  // Pre-load audio and track user interaction
  useEffect(() => {
    audioRef.current = new Audio('/notification-sound.mp3');
    audioRef.current.volume = 1.0;

    const markInteracted = () => { hasInteracted.current = true; };
    document.addEventListener('click', markInteracted, { once: true });
    document.addEventListener('touchstart', markInteracted, { once: true });

    return () => {
      document.removeEventListener('click', markInteracted);
      document.removeEventListener('touchstart', markInteracted);
    };
  }, []);

  const playNotificationSound = useCallback(() => {
    if (!hasInteracted.current || !audioRef.current) return;
    audioRef.current.currentTime = 0;
    audioRef.current.play().catch(() => {});
  }, []);

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
          playNotificationSound();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const deleteNotification = async (id: string) => {
    if (!user) return;
    await supabase.from("notificacoes").delete().eq("id", id);
    setNotificacoes((prev) => prev.filter((n) => n.id !== id));
  };

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
        className="relative p-2 rounded-full hover:bg-secondary/60 transition-all active:scale-90 hover:scale-110 hover:shadow-md"
        style={{ transition: 'transform 0.2s ease, box-shadow 0.2s ease' }}
      >
        <Bell className="w-5 h-5 text-muted-foreground" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full flex items-center justify-center shadow-sm">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-foreground/5"
              onClick={() => setOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, y: -8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.98 }}
              transition={{ type: "spring", duration: 0.35, bounce: 0.15 }}
              className="fixed top-14 max-h-[28rem] bg-card/95 backdrop-blur-xl border border-border/30 rounded-2xl shadow-2xl z-50 overflow-hidden"
              style={{ left: '0.5rem', right: '0.5rem' }}
            >
              {/* Header */}
              <div className="px-4 pt-4 pb-2">
                <h3 className="text-base font-semibold tracking-tight">
                  Notificações
                </h3>
              </div>

              {/* Push toggle */}
              {pushSupported && (
                <div className="mx-3 mb-2 px-3.5 py-2.5 bg-secondary/40 rounded-xl flex items-center justify-between">
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
                      className="flex items-center gap-1 text-[11px] text-primary font-medium"
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

              <div className="h-px bg-border/30 mx-3" />

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
                  <AnimatePresence>
                    {notificacoes.map((n) => (
                      <motion.div
                        key={n.id}
                        layout
                        exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                        transition={{ duration: 0.25 }}
                      >
                        <SwipeToDelete onDelete={() => deleteNotification(n.id)}>
                          <div
                            className={`px-3 py-2.5 transition-colors ${
                              !n.lida ? "bg-primary/5" : ""
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
                        </SwipeToDelete>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

export default NotificationBell;

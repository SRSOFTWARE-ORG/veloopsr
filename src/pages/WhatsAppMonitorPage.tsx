import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { RefreshCw, MessageSquare, Bot, User, AlertCircle, CheckCircle2, Clock, Phone, Send } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

interface Conversation {
  id: string;
  phone: string;
  stage: string;
  status: string;
  updated_at: string;
  created_at: string;
}

interface Message {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  created_at: string;
}

const stageLabels: Record<string, { label: string; color: string }> = {
  idle: { label: "Livre", color: "bg-muted text-muted-foreground" },
  awaiting_cpf: { label: "Aguardando CPF", color: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400" },
  awaiting_cpf_payment: { label: "CPF (Pagamento)", color: "bg-orange-500/15 text-orange-700 dark:text-orange-400" },
  awaiting_payment_choice: { label: "Escolhendo Parcela", color: "bg-blue-500/15 text-blue-700 dark:text-blue-400" },
  awaiting_payment_confirm: { label: "Confirmando PIX", color: "bg-primary/15 text-primary" },
};

const statusLabels: Record<string, { label: string; icon: React.ReactNode }> = {
  auto: { label: "Bot Ativo", icon: <Bot className="w-3.5 h-3.5" /> },
  manual: { label: "Atendimento Humano", icon: <User className="w-3.5 h-3.5" /> },
};

export default function WhatsAppMonitorPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Record<string, Message[]>>({});
  const [selectedConv, setSelectedConv] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [resending, setResending] = useState(false);
  const [clienteNames, setClienteNames] = useState<Record<string, string>>({});
  const [summary, setSummary] = useState({ whatsapp_pending: 0, pix_pending: 0 });

  const fetchData = async () => {
    setLoading(true);
    try {
      const [convsRes, summaryRes] = await Promise.all([
        supabase.from("conversations").select("*").order("updated_at", { ascending: false }).limit(50),
        supabase.functions.invoke("admin-whatsapp-actions", { body: { action: "summary" } })
      ]);

      const convs = convsRes.data;
      if (convs) {
        setConversations(convs);
        const phones = convs.map((c) => c.phone);
        const names: Record<string, string> = {};
        for (const phone of phones) {
          const last8 = phone.slice(-8);
          const { data: cliente } = await supabase.from("clientes").select("nome").or(`telefone.ilike.%${last8}%`).limit(1).maybeSingle();
          if (cliente) names[phone] = cliente.nome;
        }
        setClienteNames(names);

        const msgMap: Record<string, Message[]> = {};
        for (const conv of convs) {
          const { data: msgs } = await supabase.from("messages").select("*").eq("conversation_id", conv.id).order("created_at", { ascending: false }).limit(5);
          if (msgs) msgMap[conv.id] = msgs.reverse();
        }
        setMessages(msgMap);
      }

      if (summaryRes.data?.success) {
        setSummary(summaryRes.data.summary);
      }
    } catch (e) {
      console.error("Error fetching monitor data:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleResendPending = async () => {
    if (summary.whatsapp_pending === 0) {
      toast.info("Não há mensagens pendentes para reenviar.");
      return;
    }
    setResending(true);
    toast.loading(`Reenviando ${summary.whatsapp_pending} mensagens...`, { id: "resend-wa" });
    try {
      const { data, error } = await supabase.functions.invoke("admin-whatsapp-actions", {
        body: { action: "resend_all" }
      });
      if (error) throw error;
      toast.success(`${data.count} mensagens reenviadas com sucesso!`, { id: "resend-wa" });
      fetchData();
    } catch (e: any) {
      toast.error(`Falha no reenvio: ${e.message}`, { id: "resend-wa" });
    } finally {
      setResending(false);
    }
  };

  useEffect(() => {
    fetchData();
    const channel = supabase.channel("whatsapp-monitor").on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, () => fetchData()).on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, () => fetchData()).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const activeConversations = conversations.filter((c) => c.stage !== "idle" || c.status === "manual");
  const recentConversations = conversations.filter((c) => c.stage === "idle" && c.status !== "manual");

  const formatPhone = (phone: string) => {
    if (phone.length === 13) return `+${phone.slice(0, 2)} (${phone.slice(2, 4)}) ${phone.slice(4, 9)}-${phone.slice(9)}`;
    if (phone.length === 12) return `+${phone.slice(0, 2)} (${phone.slice(2, 4)}) ${phone.slice(4, 8)}-${phone.slice(8)}`;
    return phone;
  };

  const renderConversationCard = (conv: Conversation) => {
    const stage = stageLabels[conv.stage] || { label: conv.stage, color: "bg-muted text-muted-foreground" };
    const status = statusLabels[conv.status] || { label: conv.status, icon: <AlertCircle className="w-3.5 h-3.5" /> };
    const convMessages = messages[conv.id] || [];
    const lastMsg = convMessages[convMessages.length - 1];
    const clienteName = clienteNames[conv.phone];

    return (
      <Card
        key={conv.id}
        className={`cursor-pointer transition-all hover:shadow-md ${selectedConv === conv.id ? "ring-2 ring-primary" : ""}`}
        onClick={() => setSelectedConv(selectedConv === conv.id ? null : conv.id)}
      >
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <Phone className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="font-semibold text-sm truncate">{clienteName || formatPhone(conv.phone)}</span>
              </div>
              {clienteName && (
                <p className="text-xs text-muted-foreground ml-6 mb-1">{formatPhone(conv.phone)}</p>
              )}
              <div className="flex items-center gap-2 flex-wrap mt-2">
                <Badge variant="outline" className={`text-xs ${stage.color}`}>{stage.label}</Badge>
                <Badge variant="outline" className="text-xs flex items-center gap-1">
                  {status.icon} {status.label}
                </Badge>
              </div>
            </div>
            <div className="text-right shrink-0">
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {formatDistanceToNow(new Date(conv.updated_at), { addSuffix: true, locale: ptBR })}
              </p>
            </div>
          </div>

          {lastMsg && lastMsg.role !== "system" && (
            <div className="mt-3 pt-3 border-t border-border/50">
              <p className="text-xs text-muted-foreground truncate">
                <span className="font-medium">{lastMsg.role === "user" ? "👤 Cliente:" : "🤖 Bot:"}</span>{" "}
                {lastMsg.content.replace(/\*|✨|_/g, "").slice(0, 120)}
              </p>
            </div>
          )}

          {selectedConv === conv.id && convMessages.length > 0 && (
            <div className="mt-3 pt-3 border-t border-border/50 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground mb-2">Últimas mensagens:</p>
              {convMessages
                .filter((m) => m.role !== "system")
                .map((msg) => (
                  <div
                    key={msg.id}
                    className={`text-xs p-2 rounded-lg ${
                      msg.role === "user"
                        ? "bg-primary/10 text-foreground ml-4"
                        : "bg-muted text-foreground mr-4"
                    }`}
                  >
                    <div className="flex items-center gap-1 mb-1 text-muted-foreground">
                      {msg.role === "user" ? <User className="w-3 h-3" /> : <Bot className="w-3 h-3" />}
                      <span className="font-medium">{msg.role === "user" ? "Cliente" : "Bot"}</span>
                      <span className="ml-auto">
                        {new Date(msg.created_at!).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    <p className="whitespace-pre-wrap break-words">{msg.content.replace(/✨/g, "").slice(0, 300)}</p>
                  </div>
                ))}
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="p-4 md:p-6 space-y-6 pb-24 md:pb-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Monitor WhatsApp</h1>
          <p className="text-sm text-muted-foreground">Acompanhe conversas ativas e status do bot em tempo real</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

      {/* Status Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <MessageSquare className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{conversations.length}</p>
              <p className="text-xs text-muted-foreground">Total Conversas</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-yellow-500/10">
              <AlertCircle className="w-5 h-5 text-yellow-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{activeConversations.length}</p>
              <p className="text-xs text-muted-foreground">Em Andamento</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-500/10">
              <CheckCircle2 className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{conversations.filter((c) => c.status === "auto").length}</p>
              <p className="text-xs text-muted-foreground">Bot Ativo</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/10">
              <User className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{conversations.filter((c) => c.status === "manual").length}</p>
              <p className="text-xs text-muted-foreground">Atend. Humano</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Active Conversations */}
      {activeConversations.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-yellow-600" />
            Conversas em Andamento ({activeConversations.length})
          </h2>
          <div className="grid gap-3 md:grid-cols-2">
            {activeConversations.map(renderConversationCard)}
          </div>
        </div>
      )}

      {/* Recent Conversations */}
      <div>
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-green-600" />
          Conversas Recentes ({recentConversations.length})
        </h2>
        <ScrollArea className="max-h-[600px]">
          <div className="grid gap-3 md:grid-cols-2">
            {recentConversations.map(renderConversationCard)}
          </div>
        </ScrollArea>
      </div>

      {conversations.length === 0 && !loading && (
        <Card>
          <CardContent className="p-8 text-center">
            <MessageSquare className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">Nenhuma conversa registrada ainda.</p>
            <p className="text-xs text-muted-foreground mt-1">As conversas aparecerão aqui quando clientes enviarem mensagens via WhatsApp.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

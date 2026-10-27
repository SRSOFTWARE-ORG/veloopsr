import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Sparkles, Send, X, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";

interface PendingAction {
  action: string;
  args: any;
  description: string;
  confirmation_token: string;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const AISearchBar = () => {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [executing, setExecuting] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const handleSearch = async () => {
    if (!query.trim()) return;
    const userMsg = query.trim();
    setQuery("");
    setLoading(true);
    setExpanded(true);
    setPendingAction(null);

    const newMessages: ChatMessage[] = [...messages, { role: "user", content: userMsg }];
    setMessages(newMessages);

    try {
      const { data, error } = await supabase.functions.invoke("ai-assistant", {
        body: {
          query: userMsg,
          type: "search",
          history: newMessages.slice(-10),
        },
      });
      if (error) throw error;
      if (data?.error) {
        toast.error(data.error);
        return;
      }
      const aiResponse = data?.response || "Sem resposta";
      setMessages((prev) => [...prev, { role: "assistant", content: aiResponse }]);
      if (data?.pending_action) {
        setPendingAction(data.pending_action);
      }
    } catch (e: any) {
      toast.error(e.message || "Erro ao consultar IA");
    } finally {
      setLoading(false);
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    }
  };

  const handleConfirmAction = async () => {
    if (!pendingAction) return;
    setExecuting(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-assistant", {
        body: { confirm_action: { action: pendingAction.action, args: pendingAction.args, confirmation_token: pendingAction.confirmation_token } },
      });
      if (error) throw error;
      if (data?.error) {
        toast.error(data.error);
        return;
      }
      const result = data?.response || "✅ Ação executada";
      setMessages((prev) => [...prev, { role: "assistant", content: result }]);
      setPendingAction(null);
      toast.success("Ação executada com sucesso!");
    } catch (e: any) {
      toast.error(e.message || "Erro ao executar ação");
    } finally {
      setExecuting(false);
    }
  };

  const handleCancelAction = () => {
    setPendingAction(null);
    setMessages((prev) => [...prev, { role: "assistant", content: "❌ Ação cancelada pelo usuário." }]);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSearch();
    }
  };

  const handleClear = () => {
    setMessages([]);
    setQuery("");
    setPendingAction(null);
    setExpanded(false);
  };

  return (
    <div className="space-y-3">
      {/* Search Bar */}
      <div className="relative">
        <div className="flex items-center gap-2 p-1 rounded-xl border border-primary/30 bg-gradient-to-r from-primary/5 to-accent/5 shadow-lg">
          <div className="flex items-center gap-2 pl-3">
            <Sparkles className="w-5 h-5 text-primary animate-pulse" />
          </div>
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => setExpanded(true)}
            placeholder="Comande a IA... Ex: 'Exclua o cliente X', 'Altere preço do produto Y'"
            className="border-0 bg-transparent shadow-none focus-visible:ring-0 text-sm"
          />
          {(query || messages.length > 0) && (
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={handleClear}>
              <X className="w-4 h-4" />
            </Button>
          )}
          <Button
            size="sm"
            onClick={handleSearch}
            disabled={loading || !query.trim()}
            className="shrink-0 gap-1 rounded-lg mr-1"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </div>
      </div>

      {/* Chat History */}
      {expanded && messages.length > 0 && (
        <div className="rounded-xl border border-primary/20 bg-card shadow-md max-h-[400px] overflow-y-auto">
          <div className="p-4 space-y-3">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-secondary-foreground"
                  }`}
                >
                  {msg.role === "assistant" ? (
                    <div className="prose prose-sm max-w-none dark:prose-invert">
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                  ) : (
                    msg.content
                  )}
                </div>
              </div>
            ))}

            {/* Action Confirmation */}
            {pendingAction && (
              <div className="flex items-center gap-3 pt-2 border-t border-border/40">
                <Button
                  size="sm"
                  onClick={handleConfirmAction}
                  disabled={executing}
                  className="gap-2 bg-primary hover:bg-primary/90 text-primary-foreground"
                >
                  {executing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  {executing ? "Executando..." : "Confirmar"}
                </Button>
                <Button size="sm" variant="outline" onClick={handleCancelAction} disabled={executing} className="gap-2">
                  <XCircle className="w-4 h-4" />
                  Cancelar
                </Button>
              </div>
            )}

            {/* Loading */}
            {loading && (
              <div className="flex items-center gap-3">
                <Loader2 className="w-4 h-4 text-primary animate-spin" />
                <span className="text-sm text-muted-foreground">Processando...</span>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
        </div>
      )}

      {/* Quick Suggestions */}
      {expanded && messages.length === 0 && !loading && (
        <div className="flex flex-wrap gap-2 animate-fade-in">
          {[
            "Excluir cliente inadimplente",
            "Alterar preço de um produto",
            "Deletar venda duplicada",
            "Disparar lembretes de cobrança",
            "Enviar WhatsApp para cliente",
            "Resumo financeiro do mês",
          ].map((s) => (
            <button
              key={s}
              onClick={() => setQuery(s)}
              className="text-xs px-3 py-1.5 rounded-full border border-primary/20 bg-primary/5 hover:bg-primary/10 text-foreground/70 hover:text-foreground transition-colors"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default AISearchBar;

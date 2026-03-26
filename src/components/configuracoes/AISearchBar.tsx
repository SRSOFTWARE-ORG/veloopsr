import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Sparkles, Send, X, Loader2, Lightbulb, CheckCircle2, XCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";

interface PendingAction {
  action: string;
  args: any;
  description: string;
}

const AISearchBar = () => {
  const [query, setQuery] = useState("");
  const [response, setResponse] = useState("");
  const [loading, setLoading] = useState(false);
  const [tips, setTips] = useState("");
  const [tipsLoading, setTipsLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [executing, setExecuting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadTips();
  }, []);

  const loadTips = async () => {
    setTipsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-assistant", {
        body: { query: "", type: "proactive_tips" },
      });
      if (error) throw error;
      if (data?.response) setTips(data.response);
    } catch (e: any) {
      console.error("Tips error:", e);
    } finally {
      setTipsLoading(false);
    }
  };

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setExpanded(true);
    setResponse("");
    setPendingAction(null);
    try {
      const { data, error } = await supabase.functions.invoke("ai-assistant", {
        body: { query: query.trim(), type: "search" },
      });
      if (error) throw error;
      if (data?.error) {
        toast.error(data.error);
        return;
      }
      setResponse(data?.response || "Sem resposta");
      if (data?.pending_action) {
        setPendingAction(data.pending_action);
      }
    } catch (e: any) {
      toast.error(e.message || "Erro ao consultar IA");
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmAction = async () => {
    if (!pendingAction) return;
    setExecuting(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-assistant", {
        body: { confirm_action: { action: pendingAction.action, args: pendingAction.args } },
      });
      if (error) throw error;
      if (data?.error) {
        toast.error(data.error);
        return;
      }
      setResponse(data?.response || "✅ Ação executada");
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
    setResponse("❌ Ação cancelada pelo usuário.");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSearch();
    }
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
            placeholder="Pergunte ou comande a IA... Ex: 'Marque parcela do André como paga'"
            className="border-0 bg-transparent shadow-none focus-visible:ring-0 text-sm"
          />
          {query && (
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => { setQuery(""); setResponse(""); setPendingAction(null); }}>
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

      {/* Proactive Tips */}
      {tips && !response && !loading && (
        <div className="rounded-xl border border-accent/50 bg-accent/10 p-3 animate-fade-in">
          <div className="flex items-center gap-2 mb-2">
            <Lightbulb className="w-4 h-4 text-accent-foreground" />
            <span className="text-xs font-semibold text-accent-foreground uppercase tracking-wide">Dicas da IA</span>
            <Button variant="ghost" size="sm" className="ml-auto h-6 text-xs" onClick={loadTips} disabled={tipsLoading}>
              {tipsLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : "Atualizar"}
            </Button>
          </div>
          <div className="text-sm text-foreground/80 prose prose-sm max-w-none dark:prose-invert">
            <ReactMarkdown>{tips}</ReactMarkdown>
          </div>
        </div>
      )}

      {/* AI Response */}
      {expanded && response && (
        <div className="rounded-xl border border-primary/20 bg-card p-4 animate-fade-in shadow-md">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-4 h-4 text-primary" />
            <span className="text-xs font-semibold text-primary uppercase tracking-wide">
              {pendingAction ? "Ação Pendente" : "Resposta da IA"}
            </span>
            <Button variant="ghost" size="sm" className="ml-auto h-6 text-xs" onClick={() => { setResponse(""); setExpanded(false); setPendingAction(null); }}>
              Fechar
            </Button>
          </div>
          <div className="text-sm prose prose-sm max-w-none dark:prose-invert">
            <ReactMarkdown>{response}</ReactMarkdown>
          </div>

          {/* Action Confirmation Buttons */}
          {pendingAction && (
            <div className="flex items-center gap-3 mt-4 pt-3 border-t border-border/40">
              <Button
                size="sm"
                onClick={handleConfirmAction}
                disabled={executing}
                className="gap-2 bg-green-600 hover:bg-green-700 text-white"
              >
                {executing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                {executing ? "Executando..." : "Confirmar"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleCancelAction}
                disabled={executing}
                className="gap-2"
              >
                <XCircle className="w-4 h-4" />
                Cancelar
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="rounded-xl border border-primary/20 bg-card p-4 animate-fade-in">
          <div className="flex items-center gap-3">
            <Loader2 className="w-5 h-5 text-primary animate-spin" />
            <span className="text-sm text-muted-foreground">Analisando dados do sistema...</span>
          </div>
        </div>
      )}

      {/* Quick Suggestions */}
      {expanded && !response && !loading && (
        <div className="flex flex-wrap gap-2 animate-fade-in">
          {[
            "Parcelas atrasadas hoje",
            "Resumo financeiro do mês",
            "Alterar estoque do produto X",
            "Marcar parcela como paga",
          ].map((s) => (
            <button
              key={s}
              onClick={() => { setQuery(s); }}
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

import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Search, Sparkles, Send, X, Loader2, Lightbulb } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";

const AISearchBar = () => {
  const [query, setQuery] = useState("");
  const [response, setResponse] = useState("");
  const [loading, setLoading] = useState(false);
  const [tips, setTips] = useState("");
  const [tipsLoading, setTipsLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
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
    } catch (e: any) {
      toast.error(e.message || "Erro ao consultar IA");
    } finally {
      setLoading(false);
    }
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
        <div className="flex items-center gap-2 p-1 rounded-xl border border-primary/30 bg-gradient-to-r from-primary/5 to-accent/5 shadow-lg"
          style={{ boxShadow: '0 0 20px rgba(var(--primary), 0.1)' }}>
          <div className="flex items-center gap-2 pl-3">
            <Sparkles className="w-5 h-5 text-primary animate-pulse" />
          </div>
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => setExpanded(true)}
            placeholder="Pergunte à IA... Ex: 'Quanto o André ainda deve?' ou 'Parcelas atrasadas'"
            className="border-0 bg-transparent shadow-none focus-visible:ring-0 text-sm"
          />
          {query && (
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => { setQuery(""); setResponse(""); }}>
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
      {tips && !response && (
        <div className="rounded-xl border border-amber-200/50 bg-amber-50/50 dark:bg-amber-950/20 dark:border-amber-800/30 p-3 animate-fade-in">
          <div className="flex items-center gap-2 mb-2">
            <Lightbulb className="w-4 h-4 text-amber-500" />
            <span className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wide">Dicas da IA</span>
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
            <span className="text-xs font-semibold text-primary uppercase tracking-wide">Resposta da IA</span>
            <Button variant="ghost" size="sm" className="ml-auto h-6 text-xs" onClick={() => { setResponse(""); setExpanded(false); }}>
              Fechar
            </Button>
          </div>
          <div className="text-sm prose prose-sm max-w-none dark:prose-invert">
            <ReactMarkdown>{response}</ReactMarkdown>
          </div>
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
            "Clientes com pendências",
            "Estoque baixo",
          ].map((s) => (
            <button
              key={s}
              onClick={() => { setQuery(s); setTimeout(handleSearch, 100); }}
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

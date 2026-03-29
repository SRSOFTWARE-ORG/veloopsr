import { useEffect, useState } from "react";
import { formatCurrency } from "@/lib/masks";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Plus,
  Search,
  ShoppingCart,
  Minus,
  Trash2,
  Calculator,
  Check,
  X,
  MessageCircle,
  ChevronRight,
  ChevronLeft,
  CalendarDays,
  Pencil,
  Eye,
  EyeOff,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import EditVendaDialog from "@/components/vendas/EditVendaDialog";

interface CartItem {
  produto_id: string;
  nome: string;
  preco_unitario: number;
  quantidade: number;
  subtotal: number;
}

interface Venda {
  id: string;
  cliente_nome: string;
  cliente_telefone: string | null;
  valor_total: number;
  valor_entrada: number;
  num_parcelas: number;
  valor_parcela: number;
  desconto_percentual: number;
  status: string;
  created_at: string;
  forma_pagamento: string | null;
  frequencia_parcela: string | null;
  data_inicio_pagamento: string | null;
}

interface Cliente {
  id: string;
  nome: string;
  telefone: string | null;
  cpf: string | null;
}

const frequenciaLabels: Record<string, string> = {
  semana: "Semanal",
  quinzena: "Quinzenal",
  mes: "Mensal",
};

const VendasPage = () => {
  const { user, isAdmin, isPrimaryAdmin, isReadOnly, permissions } = useAuth();
  const [vendas, setVendas] = useState<Venda[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editVenda, setEditVenda] = useState<Venda | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [step, setStep] = useState(1); // 1=produtos, 2=cliente, 3=pagamento, 4=resumo

  // Cart state
  const [cart, setCart] = useState<CartItem[]>([]);
  const [produtos, setProdutos] = useState<any[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [produtoSearch, setProdutoSearch] = useState("");
  const [clienteSearch, setClienteSearch] = useState("");

  // Client
  const [selectedCliente, setSelectedCliente] = useState<Cliente | null>(null);

  // Payment
  const [formaPagamento, setFormaPagamento] = useState<"avista" | "parcelado">("parcelado");
  const [temEntrada, setTemEntrada] = useState(false);
  const [entrada, setEntrada] = useState(0);
  const [dataEntrada, setDataEntrada] = useState(() => new Date().toISOString().split("T")[0]);
  const [desconto, setDesconto] = useState(0);
  const [frequencia, setFrequencia] = useState("mes");
  const [numParcelas, setNumParcelas] = useState(1);
  const [dataInicio, setDataInicio] = useState("");
  const [observacoes, setObservacoes] = useState("");

  useEffect(() => {
    fetchVendas();
    fetchProdutos();
    fetchClientes();
  }, []);

  const fetchVendas = async () => {
    const { data } = await supabase
      .from("vendas")
      .select("*")
      .order("created_at", { ascending: false });
    setVendas((data as Venda[]) || []);
  };

  const fetchProdutos = async () => {
    const { data } = await supabase.from("produtos").select("*").gt("estoque_atual", 0).order("nome");
    setProdutos(data || []);
  };

  const fetchClientes = async () => {
    const { data } = await supabase.from("clientes").select("id, nome, telefone, cpf").order("nome");
    setClientes(data || []);
  };

  const subtotal = cart.reduce((sum, item) => sum + item.subtotal, 0);
  const descontoValor = subtotal * (desconto / 100);
  const total = subtotal - descontoValor;
  const restante = total - (temEntrada ? entrada : 0);
  const valorParcela = formaPagamento === "avista" ? total : (numParcelas > 0 ? restante / numParcelas : restante);

  const addToCart = (produto: any) => {
    const existing = cart.find((c) => c.produto_id === produto.id);
    if (existing) {
      if (existing.quantidade >= produto.estoque_atual) {
        toast.error("Estoque insuficiente");
        return;
      }
      setCart(
        cart.map((c) =>
          c.produto_id === produto.id
            ? { ...c, quantidade: c.quantidade + 1, subtotal: (c.quantidade + 1) * c.preco_unitario }
            : c
        )
      );
    } else {
      setCart([...cart, {
        produto_id: produto.id,
        nome: produto.nome,
        preco_unitario: Number(produto.preco_venda),
        quantidade: 1,
        subtotal: Number(produto.preco_venda),
      }]);
    }
    setProdutoSearch("");
  };

  const removeFromCart = (produto_id: string) => {
    setCart(cart.filter((c) => c.produto_id !== produto_id));
  };

  const updateQty = (produto_id: string, delta: number) => {
    setCart(
      cart
        .map((c) =>
          c.produto_id === produto_id
            ? { ...c, quantidade: c.quantidade + delta, subtotal: (c.quantidade + delta) * c.preco_unitario }
            : c
        )
        .filter((c) => c.quantidade > 0)
    );
  };

  const handleDescontoChange = (value: number) => {
    if (!isAdmin && !permissions.pode_dar_desconto) {
      toast.error("Você não tem permissão para dar desconto");
      return;
    }
    if (!isAdmin && value > permissions.limite_desconto) {
      toast.error(`Desconto máximo permitido: ${permissions.limite_desconto}%`);
      return;
    }
    setDesconto(value);
  };

  const canAdvanceStep = () => {
    if (step === 1) return cart.length > 0;
    if (step === 2) return selectedCliente !== null;
    if (step === 3) {
      if (formaPagamento === "avista") return true;
      return numParcelas > 0 && dataInicio !== "";
    }
    return true;
  };

  const resetForm = () => {
    setCart([]);
    setSelectedCliente(null);
    setFormaPagamento("parcelado");
    setTemEntrada(false);
    setEntrada(0);
    setDataEntrada(new Date().toISOString().split("T")[0]);
    setDesconto(0);
    setFrequencia("mes");
    setNumParcelas(1);
    setDataInicio("");
    setObservacoes("");
    setStep(1);
    setProdutoSearch("");
    setClienteSearch("");
  };

  const finalizarVenda = async (status: "simulacao" | "concluida") => {
    if (!selectedCliente) { toast.error("Selecione um cliente"); return; }
    if (cart.length === 0) { toast.error("Adicione produtos"); return; }
    if (total <= 0) { toast.error("Valor total deve ser maior que R$ 0,00"); return; }
    if (formaPagamento === "parcelado" && valorParcela <= 0) { toast.error("Valor da parcela deve ser maior que R$ 0,00"); return; }
    if (temEntrada && entrada <= 0) { toast.error("Valor da entrada deve ser maior que R$ 0,00"); return; }

    const { data: venda, error } = await supabase
      .from("vendas")
      .insert({
        cliente_nome: selectedCliente.nome,
        cliente_telefone: selectedCliente.telefone || null,
        cliente_cpf: selectedCliente.cpf || null,
        valor_total: total,
        valor_entrada: temEntrada ? entrada : 0,
        data_entrada: temEntrada ? dataEntrada : null,
        num_parcelas: formaPagamento === "avista" ? 1 : numParcelas,
        valor_parcela: formaPagamento === "avista" ? total : valorParcela,
        desconto_percentual: desconto,
        status,
        vendedor_id: user!.id,
        forma_pagamento: formaPagamento,
        frequencia_parcela: formaPagamento === "avista" ? null : frequencia,
        data_inicio_pagamento: formaPagamento === "avista" ? null : dataInicio || null,
        observacoes: observacoes || null,
      })
      .select()
      .single();

    if (error || !venda) { toast.error("Erro ao salvar venda"); return; }

    const itens = cart.map((c) => ({
      venda_id: venda.id,
      produto_id: c.produto_id,
      quantidade: c.quantidade,
      preco_unitario: c.preco_unitario,
      subtotal: c.subtotal,
    }));

    await supabase.from("venda_itens").insert(itens);

    if (status === "concluida") {
      for (const item of cart) {
        const prod = produtos.find((p) => p.id === item.produto_id);
        if (prod) {
          await supabase.from("produtos").update({
            estoque_atual: prod.estoque_atual - item.quantidade,
          }).eq("id", item.produto_id);
        }
      }

      // Auto-register entrada in cobranca system (with dedup guard)
      if (temEntrada && entrada > 0) {
        const entradaDate = dataEntrada || new Date().toISOString().split("T")[0];
        
        // DEDUP: Check if entrada already exists for this client on this date
        const { data: existingEntrada } = await supabase
          .from("cobrancas")
          .select("id")
          .eq("cliente_id", selectedCliente.id)
          .eq("data_inicio", entradaDate)
          .ilike("observacoes", "Entrada%")
          .limit(1);

        if (!existingEntrada || existingEntrada.length === 0) {
          const { data: cob } = await supabase.from("cobrancas").insert({
            cliente_id: selectedCliente.id,
            cliente_nome: selectedCliente.nome,
            valor_parcela: entrada,
            data_inicio: entradaDate,
            data_fim: entradaDate,
            frequencia: "mes",
            criado_por: user!.id,
            observacoes: `Entrada da venda #${venda.id.slice(0, 8)}`,
          }).select().single();

          if (cob) {
            await supabase.from("cobranca_pagamentos").insert({
              cobranca_id: cob.id,
              data_vencimento: entradaDate,
              status: "pago",
              pago_em: new Date().toISOString(),
              pago_por: user!.id,
              tipo_pagamento: "entrada",
            });
          }
        }
      }
    }

    toast.success(status === "concluida" ? "Venda finalizada e enviada para o painel!" : "Simulação salva!");
    setDialogOpen(false);
    resetForm();
    fetchVendas();
    fetchProdutos();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "concluida": return "bg-primary/10 text-primary";
      case "simulacao": return "bg-blue-500/10 text-blue-600";
      case "pendente": return "bg-yellow-500/10 text-yellow-600";
      case "cancelada": return "bg-destructive/10 text-destructive";
      default: return "bg-secondary text-secondary-foreground";
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "concluida": return "Concluída";
      case "simulacao": return "Simulação";
      case "pendente": return "Pendente";
      case "cancelada": return "Cancelada";
      default: return status;
    }
  };

  const sendWhatsApp = (venda: Venda) => {
    if (!venda.cliente_telefone) { toast.error("Cliente sem telefone cadastrado"); return; }
    const phone = venda.cliente_telefone.replace(/\D/g, "");
    const msg = encodeURIComponent(
      `Olá, ${venda.cliente_nome}! Passando para lembrar sobre sua parcela de ${formatCurrency(venda.valor_parcela)} referente à compra na SR Software. Dúvidas estamos à disposição! 📲`
    );
    window.open(`https://api.whatsapp.com/send?phone=55${phone}&text=${msg}`, "_blank");
  };

  const filteredVendas = vendas.filter(
    (v) =>
      v.cliente_nome.toLowerCase().includes(search.toLowerCase()) ||
      (v.status || "").includes(search.toLowerCase())
  );

  const filteredProdutos = produtos.filter(
    (p) =>
      p.nome.toLowerCase().includes(produtoSearch.toLowerCase()) ||
      p.codigo_barras?.includes(produtoSearch)
  );

  const filteredClientes = clientes.filter(
    (c) =>
      c.nome.toLowerCase().includes(clienteSearch.toLowerCase()) ||
      c.cpf?.includes(clienteSearch) ||
      c.telefone?.includes(clienteSearch)
  );

  const stepTitles = ["Produtos", "Cliente", "Pagamento", "Resumo"];

  return (
    <div className="page-container pb-24 md:pb-8">
      <div className="flex items-center justify-between mb-4 slide-up">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight">Vendas</h1>
          <p className="text-sm text-muted-foreground">{vendas.length} registros</p>
        </div>
        <Button size="sm" onClick={() => { resetForm(); setDialogOpen(true); }}>
          <Plus className="w-4 h-4 mr-1" /> Nova Venda
        </Button>
      </div>

      <div className="relative mb-4 slide-up delay-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Buscar vendas..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
      </div>

      <div className="space-y-2">
         {filteredVendas.map((v, i) => {
          const isExpanded = expandedVendaId === v.id;
          const valorTotalComEntrada = (v.valor_entrada || 0) > 0 ? (v.valor_entrada || 0) + v.valor_total : v.valor_total;
          return (
            <Card key={v.id} className={`slide-up delay-${Math.min(i + 2, 6)}`}>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <ShoppingCart className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">{v.cliente_nome}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className="text-xs font-bold tabular-nums">
                        {formatCurrency(v.valor_total)}
                      </span>
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${getStatusColor(v.status || "")}`}>
                        {getStatusLabel(v.status || "")}
                      </span>
                      {(v.num_parcelas || 0) > 1 && (
                        <span className="text-xs text-muted-foreground">
                          {v.num_parcelas}x {formatCurrency(v.valor_parcela)}
                          {v.frequencia_parcela && ` · ${frequenciaLabels[v.frequencia_parcela] || v.frequencia_parcela}`}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-primary"
                      onClick={() => setExpandedVendaId(isExpanded ? null : v.id)}
                    >
                      {isExpanded ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </Button>
                    {v.cliente_telefone && (
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-primary" onClick={() => sendWhatsApp(v)}>
                        <MessageCircle className="w-4 h-4" />
                      </Button>
                    )}
                    {isPrimaryAdmin && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => { setEditVenda(v); setEditDialogOpen(true); }}
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                    )}
                    {isPrimaryAdmin && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive"
                        onClick={async () => {
                          if (!confirm("Excluir esta venda?")) return;
                          await supabase.from("vendas").delete().eq("id", v.id);
                          toast.success("Venda excluída");
                          fetchVendas();
                        }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>

                {isExpanded && (
                  <div className="mt-3 pt-3 border-t border-border/50 space-y-2 animate-fade-in">
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      {(v.valor_entrada || 0) > 0 && (
                        <>
                          <span className="text-muted-foreground">Entrada</span>
                          <span className="text-right font-medium text-green-600 tabular-nums">{formatCurrency(v.valor_entrada || 0)}</span>
                        </>
                      )}
                      {(v.num_parcelas || 0) > 1 && (
                        <>
                          <span className="text-muted-foreground">Parcelas</span>
                          <span className="text-right font-medium tabular-nums">{v.num_parcelas}x {formatCurrency(v.valor_parcela)}</span>
                        </>
                      )}
                      {(v.valor_entrada || 0) > 0 && (
                        <>
                          <span className="text-muted-foreground">Valor Total (com entrada)</span>
                          <span className="text-right font-extrabold tabular-nums">{formatCurrency(valorTotalComEntrada)}</span>
                        </>
                      )}
                      <span className="text-muted-foreground">Forma de Pagamento</span>
                      <span className="text-right font-medium capitalize">{v.forma_pagamento === "avista" ? "À vista" : v.forma_pagamento === "parcelado" ? "Parcelado" : v.forma_pagamento || "—"}</span>
                      {v.frequencia_parcela && (v.num_parcelas || 0) > 1 && (
                        <>
                          <span className="text-muted-foreground">Frequência</span>
                          <span className="text-right font-medium">{frequenciaLabels[v.frequencia_parcela] || v.frequencia_parcela}</span>
                        </>
                      )}
                      {v.data_inicio_pagamento && (
                        <>
                          <span className="text-muted-foreground">1º Pagamento</span>
                          <span className="text-right font-medium">{new Date(v.data_inicio_pagamento + "T12:00:00").toLocaleDateString("pt-BR")}</span>
                        </>
                      )}
                      {v.desconto_percentual > 0 && (
                        <>
                          <span className="text-muted-foreground">Desconto</span>
                          <span className="text-right font-medium text-destructive">{v.desconto_percentual}%</span>
                        </>
                      )}
                      <span className="text-muted-foreground">Data da Venda</span>
                      <span className="text-right font-medium">{v.created_at ? new Date(v.created_at).toLocaleDateString("pt-BR") : "—"}</span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
        {filteredVendas.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <ShoppingCart className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium">Nenhuma venda encontrada</p>
          </div>
        )}
      </div>

      {/* New Sale Dialog - Step by Step */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calculator className="w-5 h-5" /> Nova Venda
            </DialogTitle>
          </DialogHeader>

          {/* Step indicator */}
          <div className="flex items-center gap-1 mb-2">
            {stepTitles.map((title, i) => (
              <div key={title} className="flex items-center gap-1 flex-1">
                <div className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold transition-colors ${
                  step > i + 1 ? "bg-primary text-primary-foreground" :
                  step === i + 1 ? "bg-primary text-primary-foreground" :
                  "bg-secondary text-muted-foreground"
                }`}>
                  {step > i + 1 ? <Check className="w-3 h-3" /> : i + 1}
                </div>
                <span className={`text-xs hidden sm:inline ${step === i + 1 ? "font-semibold" : "text-muted-foreground"}`}>
                  {title}
                </span>
                {i < 3 && <div className={`flex-1 h-px ${step > i + 1 ? "bg-primary" : "bg-border"}`} />}
              </div>
            ))}
          </div>

          {/* Step 1: Products */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input placeholder="Buscar produto ou código de barras..." value={produtoSearch} onChange={(e) => setProdutoSearch(e.target.value)} className="pl-10" />
              </div>

              {produtoSearch && (
                <div className="max-h-40 overflow-y-auto rounded-lg border border-border/60 divide-y divide-border/60">
                  {filteredProdutos.map((p) => (
                    <button key={p.id} onClick={() => addToCart(p)} className="w-full text-left px-3 py-2 hover:bg-secondary transition-colors flex justify-between items-center text-sm">
                      <div>
                        <span className="truncate">{p.nome}</span>
                        <span className="text-xs text-muted-foreground ml-2">Est: {p.estoque_atual}</span>
                      </div>
                      <span className="text-muted-foreground ml-2 shrink-0 font-medium">{formatCurrency(p.preco_venda)}</span>
                    </button>
                  ))}
                  {filteredProdutos.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-3">Nenhum produto encontrado</p>
                  )}
                </div>
              )}

              {cart.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-bold">Carrinho ({cart.length} itens)</h3>
                  {cart.map((item) => (
                    <div key={item.produto_id} className="flex items-center gap-2 bg-secondary/50 rounded-lg p-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{item.nome}</p>
                        <p className="text-xs text-muted-foreground">{formatCurrency(item.preco_unitario)} × {item.quantidade}</p>
                      </div>
                      <p className="text-sm font-bold tabular-nums">{formatCurrency(item.subtotal)}</p>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => updateQty(item.produto_id, -1)}>
                          <Minus className="w-3 h-3" />
                        </Button>
                        <span className="text-sm w-5 text-center tabular-nums">{item.quantidade}</span>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => updateQty(item.produto_id, 1)}>
                          <Plus className="w-3 h-3" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => removeFromCart(item.produto_id)}>
                          <X className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                  <div className="flex justify-between font-bold text-sm pt-2 border-t border-border/60">
                    <span>Subtotal</span>
                    <span className="tabular-nums">{formatCurrency(subtotal)}</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 2: Client */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input placeholder="Buscar cliente por nome, CPF ou telefone..." value={clienteSearch} onChange={(e) => setClienteSearch(e.target.value)} className="pl-10" />
              </div>

              <div className="max-h-60 overflow-y-auto space-y-1">
                {(clienteSearch ? filteredClientes : clientes).map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setSelectedCliente(c)}
                    className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors flex items-center gap-3 ${
                      selectedCliente?.id === c.id
                        ? "bg-primary/10 ring-1 ring-primary"
                        : "hover:bg-secondary"
                    }`}
                  >
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                      {c.nome.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{c.nome}</p>
                      <p className="text-xs text-muted-foreground">
                        {c.cpf && `CPF: ${c.cpf}`}
                        {c.cpf && c.telefone && " · "}
                        {c.telefone && `Tel: ${c.telefone}`}
                      </p>
                    </div>
                    {selectedCliente?.id === c.id && (
                      <Check className="w-4 h-4 text-primary ml-auto shrink-0" />
                    )}
                  </button>
                ))}
                {clientes.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-6">
                    Nenhum cliente cadastrado. Cadastre um cliente primeiro.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Step 3: Payment */}
          {step === 3 && (
            <div className="space-y-4">
              {/* Desconto */}
              <div className="space-y-2">
                <Label>Desconto (%)</Label>
                <Input
                  type="number"
                  value={desconto}
                  onChange={(e) => handleDescontoChange(parseFloat(e.target.value) || 0)}
                  disabled={!isAdmin && !permissions.pode_dar_desconto}
                  min={0}
                  max={100}
                  step={0.5}
                />
              </div>

              {/* Forma de pagamento */}
              <div className="space-y-2">
                <Label>Forma de Pagamento</Label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => { setFormaPagamento("avista"); setTemEntrada(false); setNumParcelas(1); }}
                    className={`px-4 py-3 rounded-lg border text-sm font-medium transition-colors ${
                      formaPagamento === "avista" ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-secondary"
                    }`}
                  >
                    À Vista
                  </button>
                  <button
                    onClick={() => setFormaPagamento("parcelado")}
                    className={`px-4 py-3 rounded-lg border text-sm font-medium transition-colors ${
                      formaPagamento === "parcelado" ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-secondary"
                    }`}
                  >
                    Parcelado
                  </button>
                </div>
              </div>

              {/* Entrada */}
              <div className="space-y-2">
                <Label>Tem entrada?</Label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => { setTemEntrada(true); }}
                    className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
                      temEntrada ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-secondary"
                    }`}
                  >
                    Sim
                  </button>
                  <button
                    onClick={() => { setTemEntrada(false); setEntrada(0); }}
                    className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
                      !temEntrada ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-secondary"
                    }`}
                  >
                    Não
                  </button>
                </div>
                {temEntrada && (
                  <>
                    <Label className="text-sm">Valor da entrada</Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-medium">R$</span>
                      <Input
                        type="text"
                        inputMode="numeric"
                        placeholder="0,00"
                        className="pl-10"
                        value={entrada ? entrada.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ""}
                        onChange={(e) => {
                          const raw = e.target.value.replace(/\D/g, "");
                          setEntrada(raw ? parseInt(raw, 10) / 100 : 0);
                        }}
                        min={0}
                      />
                    </div>
                    <Label className="text-sm mt-2">Data da entrada</Label>
                    <Input
                      type="date"
                      value={dataEntrada}
                      onChange={(e) => setDataEntrada(e.target.value)}
                    />
                  </>
                )}
              </div>

              {formaPagamento === "parcelado" && (
                <>
                  {/* Frequência */}
                  <div className="space-y-2">
                    <Label>Frequência do Parcelamento</Label>
                    <div className="grid grid-cols-3 gap-2">
                      {(["semana", "quinzena", "mes"] as const).map((f) => (
                        <button
                          key={f}
                          onClick={() => setFrequencia(f)}
                          className={`px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                            frequencia === f ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-secondary"
                          }`}
                        >
                          {frequenciaLabels[f]}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Parcelas */}
                  <div className="space-y-2">
                    <Label>Em quantas vezes?</Label>
                    <div className="flex gap-1 flex-wrap">
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((n) => (
                        <button
                          key={n}
                          onClick={() => setNumParcelas(n)}
                          className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                            numParcelas === n ? "bg-primary text-primary-foreground" : "bg-secondary hover:bg-secondary/80"
                          }`}
                        >
                          {n}x
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Data início */}
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1">
                      <CalendarDays className="w-3.5 h-3.5" />
                      Data do 1º pagamento
                    </Label>
                    <Input
                      type="date"
                      value={dataInicio}
                      onChange={(e) => setDataInicio(e.target.value)}
                    />
                  </div>
                </>
              )}

              {/* Preview calculation */}
              <div className="bg-secondary/30 rounded-xl p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="tabular-nums">{formatCurrency(subtotal)}</span>
                </div>
                {desconto > 0 && (
                  <div className="flex justify-between text-sm text-destructive">
                    <span>Desconto ({desconto}%)</span>
                    <span className="tabular-nums">- {formatCurrency(descontoValor)}</span>
                  </div>
                )}
                <div className="flex justify-between text-base font-extrabold">
                  <span>Total</span>
                  <span className="tabular-nums">{formatCurrency(total)}</span>
                </div>
                {temEntrada && entrada > 0 && (
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>Entrada</span>
                    <span className="tabular-nums">- {formatCurrency(entrada)}</span>
                  </div>
                )}
                {formaPagamento === "parcelado" && numParcelas > 0 && (
                  <div className="flex justify-between text-sm font-semibold text-primary pt-1 border-t border-border/60">
                    <span>{numParcelas}x {frequenciaLabels[frequencia]}</span>
                    <span className="tabular-nums">{formatCurrency(valorParcela)}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Step 4: Summary */}
          {step === 4 && (
            <div className="space-y-4">
              <div className="bg-secondary/30 rounded-xl p-4 space-y-3">
                <h3 className="text-sm font-bold">Cliente</h3>
                <p className="text-sm">{selectedCliente?.nome}</p>
                {selectedCliente?.telefone && <p className="text-xs text-muted-foreground">Tel: {selectedCliente.telefone}</p>}

                <h3 className="text-sm font-bold pt-2">Produtos</h3>
                {cart.map((item) => (
                  <div key={item.produto_id} className="flex justify-between text-sm">
                    <span>{item.nome} × {item.quantidade}</span>
                    <span className="tabular-nums">{formatCurrency(item.subtotal)}</span>
                  </div>
                ))}

                <div className="border-t border-border/60 pt-2 space-y-1">
                  {desconto > 0 && (
                    <div className="flex justify-between text-sm text-destructive">
                      <span>Desconto ({desconto}%)</span>
                      <span className="tabular-nums">- {formatCurrency(descontoValor)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-extrabold">
                    <span>Total</span>
                    <span className="tabular-nums">{formatCurrency(total)}</span>
                  </div>
                  {temEntrada && entrada > 0 && (
                    <div className="flex justify-between text-sm text-muted-foreground">
                      <span>Entrada</span>
                      <span className="tabular-nums">{formatCurrency(entrada)}</span>
                    </div>
                  )}
                  {formaPagamento === "parcelado" && (
                    <div className="flex justify-between text-sm font-semibold text-primary">
                      <span>{numParcelas}x {frequenciaLabels[frequencia]}</span>
                      <span className="tabular-nums">{formatCurrency(valorParcela)}</span>
                    </div>
                  )}
                  {formaPagamento === "avista" && (
                    <p className="text-sm text-muted-foreground">Pagamento à vista</p>
                  )}
                  {dataInicio && formaPagamento === "parcelado" && (
                    <p className="text-xs text-muted-foreground">
                      1º pagamento: {new Date(dataInicio + "T12:00:00").toLocaleDateString("pt-BR")}
                    </p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Observações (opcional)</Label>
                <Textarea
                  placeholder="Anotações sobre a venda..."
                  value={observacoes}
                  onChange={(e) => setObservacoes(e.target.value)}
                  rows={2}
                />
              </div>
            </div>
          )}

          {/* Navigation */}
          <div className="flex gap-2 pt-2">
            {step > 1 && (
              <Button variant="outline" onClick={() => setStep(step - 1)} className="gap-1">
                <ChevronLeft className="w-4 h-4" /> Voltar
              </Button>
            )}
            <div className="flex-1" />
            {step < 4 ? (
              <Button onClick={() => setStep(step + 1)} disabled={!canAdvanceStep()} className="gap-1">
                Próximo <ChevronRight className="w-4 h-4" />
              </Button>
            ) : (
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => finalizarVenda("simulacao")}>
                  <Calculator className="w-4 h-4 mr-1" /> Simular
                </Button>
                <Button onClick={() => finalizarVenda("concluida")}>
                  <Check className="w-4 h-4 mr-1" /> Finalizar
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <EditVendaDialog
        venda={editVenda}
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        onSaved={() => { fetchVendas(); }}
      />
    </div>
  );
};

export default VendasPage;

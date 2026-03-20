import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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
}

const VendasPage = () => {
  const { user, isAdmin, permissions } = useAuth();
  const [vendas, setVendas] = useState<Venda[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [search, setSearch] = useState("");

  // Cart state
  const [cart, setCart] = useState<CartItem[]>([]);
  const [produtos, setProdutos] = useState<any[]>([]);
  const [produtoSearch, setProdutoSearch] = useState("");
  const [clienteNome, setClienteNome] = useState("");
  const [clienteTelefone, setClienteTelefone] = useState("");
  const [clienteCpf, setClienteCpf] = useState("");
  const [desconto, setDesconto] = useState(0);
  const [entrada, setEntrada] = useState(0);
  const [numParcelas, setNumParcelas] = useState(1);

  useEffect(() => {
    fetchVendas();
    fetchProdutos();
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

  const subtotal = cart.reduce((sum, item) => sum + item.subtotal, 0);
  const descontoValor = subtotal * (desconto / 100);
  const total = subtotal - descontoValor;
  const restante = total - entrada;
  const valorParcela = numParcelas > 0 ? restante / numParcelas : restante;

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

  const finalizarVenda = async (status: "simulacao" | "concluida") => {
    if (cart.length === 0) { toast.error("Adicione produtos"); return; }
    if (!clienteNome.trim()) { toast.error("Informe o nome do cliente"); return; }

    const { data: venda, error } = await supabase
      .from("vendas")
      .insert({
        cliente_nome: clienteNome.trim(),
        cliente_telefone: clienteTelefone.trim() || null,
        cliente_cpf: clienteCpf.trim() || null,
        valor_total: total,
        valor_entrada: entrada,
        num_parcelas: numParcelas,
        valor_parcela: valorParcela,
        desconto_percentual: desconto,
        status,
        vendedor_id: user!.id,
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

    // Deduct stock if concluded
    if (status === "concluida") {
      for (const item of cart) {
        const prod = produtos.find((p) => p.id === item.produto_id);
        if (prod) {
          await supabase.from("produtos").update({
            estoque_atual: prod.estoque_atual - item.quantidade,
          }).eq("id", item.produto_id);
        }
      }
    }

    toast.success(status === "concluida" ? "Venda finalizada!" : "Simulação salva!");
    setDialogOpen(false);
    setCart([]);
    setClienteNome("");
    setClienteTelefone("");
    setClienteCpf("");
    setDesconto(0);
    setEntrada(0);
    setNumParcelas(1);
    fetchVendas();
    fetchProdutos();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "concluida": return "bg-primary/10 text-primary";
      case "simulacao": return "bg-info/10 text-info";
      case "pendente": return "bg-warning/10 text-warning";
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
      `Olá, ${venda.cliente_nome}! Passando para lembrar sobre sua parcela de R$ ${Number(venda.valor_parcela).toFixed(2)} referente à compra na SR Software. Dúvidas estamos à disposição! 📲`
    );
    window.open(`https://api.whatsapp.com/send?phone=55${phone}&text=${msg}`, "_blank");
  };

  const filteredVendas = vendas.filter(
    (v) =>
      v.cliente_nome.toLowerCase().includes(search.toLowerCase()) ||
      v.status.includes(search.toLowerCase())
  );

  const filteredProdutos = produtos.filter(
    (p) =>
      p.nome.toLowerCase().includes(produtoSearch.toLowerCase()) ||
      p.codigo_barras?.includes(produtoSearch)
  );

  return (
    <div className="page-container">
      <div className="flex items-center justify-between mb-4 slide-up">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight">Vendas</h1>
          <p className="text-sm text-muted-foreground">{vendas.length} registros</p>
        </div>
        <Button size="sm" onClick={() => setDialogOpen(true)}>
          <Plus className="w-4 h-4 mr-1" /> Nova Venda
        </Button>
      </div>

      <div className="relative mb-4 slide-up delay-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Buscar vendas..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
      </div>

      <div className="space-y-2">
        {filteredVendas.map((v, i) => (
          <Card key={v.id} className={`slide-up delay-${Math.min(i + 2, 6)}`}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <ShoppingCart className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate">{v.cliente_nome}</p>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  <span className="text-xs font-bold tabular-nums">
                    R$ {Number(v.valor_total).toFixed(2)}
                  </span>
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${getStatusColor(v.status)}`}>
                    {getStatusLabel(v.status)}
                  </span>
                  {v.num_parcelas > 1 && (
                    <span className="text-xs text-muted-foreground">
                      {v.num_parcelas}x R$ {Number(v.valor_parcela).toFixed(2)}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1">
                {v.cliente_telefone && (
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-primary" onClick={() => sendWhatsApp(v)}>
                    <MessageCircle className="w-4 h-4" />
                  </Button>
                )}
                {isAdmin && (
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
            </CardContent>
          </Card>
        ))}
        {filteredVendas.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <ShoppingCart className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium">Nenhuma venda encontrada</p>
          </div>
        )}
      </div>

      {/* New Sale Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calculator className="w-5 h-5" /> Simulador de Venda
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Client info */}
            <div className="space-y-2">
              <Input placeholder="Nome do cliente *" value={clienteNome} onChange={(e) => setClienteNome(e.target.value)} />
              <div className="grid grid-cols-2 gap-2">
                <Input placeholder="Telefone" value={clienteTelefone} onChange={(e) => setClienteTelefone(e.target.value)} />
                <Input placeholder="CPF" value={clienteCpf} onChange={(e) => setClienteCpf(e.target.value)} />
              </div>
            </div>

            {/* Product search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Buscar produto..." value={produtoSearch} onChange={(e) => setProdutoSearch(e.target.value)} className="pl-10" />
            </div>

            {produtoSearch && (
              <div className="max-h-32 overflow-y-auto rounded-lg border border-border/60 divide-y divide-border/60">
                {filteredProdutos.map((p) => (
                  <button key={p.id} onClick={() => addToCart(p)} className="w-full text-left px-3 py-2 hover:bg-secondary transition-colors flex justify-between items-center text-sm">
                    <span className="truncate">{p.nome}</span>
                    <span className="text-muted-foreground ml-2 shrink-0">R$ {Number(p.preco_venda).toFixed(2)}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Cart */}
            {cart.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-bold">Carrinho ({cart.length} itens)</h3>
                {cart.map((item) => (
                  <div key={item.produto_id} className="flex items-center gap-2 bg-secondary/50 rounded-lg p-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.nome}</p>
                      <p className="text-xs text-muted-foreground">R$ {item.preco_unitario.toFixed(2)} × {item.quantidade}</p>
                    </div>
                    <p className="text-sm font-bold tabular-nums">R$ {item.subtotal.toFixed(2)}</p>
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
              </div>
            )}

            {/* Calculation */}
            <div className="bg-secondary/30 rounded-xl p-4 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-muted-foreground">Desconto %</label>
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
                <div>
                  <label className="text-xs text-muted-foreground">Entrada R$</label>
                  <Input type="number" value={entrada} onChange={(e) => setEntrada(parseFloat(e.target.value) || 0)} min={0} step={0.01} />
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Parcelas</label>
                <div className="flex gap-1 mt-1 flex-wrap">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((n) => (
                    <button
                      key={n}
                      onClick={() => setNumParcelas(n)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                        numParcelas === n ? "bg-primary text-primary-foreground" : "bg-secondary hover:bg-secondary/80"
                      }`}
                    >
                      {n}x
                    </button>
                  ))}
                </div>
              </div>

              <div className="border-t border-border/60 pt-3 space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="tabular-nums">R$ {subtotal.toFixed(2)}</span>
                </div>
                {desconto > 0 && (
                  <div className="flex justify-between text-sm text-destructive">
                    <span>Desconto ({desconto}%)</span>
                    <span className="tabular-nums">- R$ {descontoValor.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between text-base font-extrabold">
                  <span>Total</span>
                  <span className="tabular-nums">R$ {total.toFixed(2)}</span>
                </div>
                {entrada > 0 && (
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>Restante ({numParcelas}x)</span>
                    <span className="tabular-nums">R$ {valorParcela.toFixed(2)}/mês</span>
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={() => finalizarVenda("simulacao")}>
                <Calculator className="w-4 h-4 mr-1" /> Simular
              </Button>
              <Button onClick={() => finalizarVenda("concluida")}>
                <Check className="w-4 h-4 mr-1" /> Finalizar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default VendasPage;

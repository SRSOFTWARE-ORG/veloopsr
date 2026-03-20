import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Plus, Search, Package, Edit, Trash2, BarChart3 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface Produto {
  id: string;
  nome: string;
  preco_custo: number;
  preco_venda: number;
  estoque_atual: number;
  estoque_minimo: number;
  codigo_barras: string | null;
  categoria: string | null;
}

const ProdutosPage = () => {
  const { isAdmin, user } = useAuth();
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Produto | null>(null);
  const [form, setForm] = useState({
    nome: "",
    preco_custo: "",
    preco_venda: "",
    estoque_atual: "",
    estoque_minimo: "5",
    codigo_barras: "",
    categoria: "",
  });

  useEffect(() => {
    fetchProdutos();
  }, []);

  const fetchProdutos = async () => {
    const { data } = await supabase.from("produtos").select("*").order("nome");
    setProdutos((data as Produto[]) || []);
  };

  const filtered = produtos.filter(
    (p) =>
      p.nome.toLowerCase().includes(search.toLowerCase()) ||
      p.codigo_barras?.includes(search) ||
      p.categoria?.toLowerCase().includes(search.toLowerCase())
  );

  const resetForm = () => {
    setForm({ nome: "", preco_custo: "", preco_venda: "", estoque_atual: "", estoque_minimo: "5", codigo_barras: "", categoria: "" });
    setEditingProduct(null);
  };

  const openEdit = (p: Produto) => {
    setEditingProduct(p);
    setForm({
      nome: p.nome,
      preco_custo: p.preco_custo.toString(),
      preco_venda: p.preco_venda.toString(),
      estoque_atual: p.estoque_atual.toString(),
      estoque_minimo: p.estoque_minimo.toString(),
      codigo_barras: p.codigo_barras || "",
      categoria: p.categoria || "",
    });
    setDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      nome: form.nome.trim(),
      preco_custo: parseFloat(form.preco_custo) || 0,
      preco_venda: parseFloat(form.preco_venda),
      estoque_atual: parseInt(form.estoque_atual) || 0,
      estoque_minimo: parseInt(form.estoque_minimo) || 5,
      codigo_barras: form.codigo_barras.trim() || null,
      categoria: form.categoria.trim() || null,
      atualizado_por: user?.id,
    };

    if (editingProduct) {
      const { error } = await supabase.from("produtos").update(payload).eq("id", editingProduct.id);
      if (error) { toast.error("Erro ao atualizar"); return; }
      toast.success("Produto atualizado!");
    } else {
      const { error } = await supabase.from("produtos").insert(payload);
      if (error) { toast.error("Erro ao cadastrar"); return; }
      toast.success("Produto cadastrado!");
    }

    setDialogOpen(false);
    resetForm();
    fetchProdutos();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Tem certeza?")) return;
    const { error } = await supabase.from("produtos").delete().eq("id", id);
    if (error) { toast.error("Erro ao excluir"); return; }
    toast.success("Produto excluído");
    fetchProdutos();
  };

  const handleAddStock = async (produto: Produto) => {
    const qty = prompt("Quantidade a adicionar:");
    if (!qty || isNaN(Number(qty))) return;
    const newQty = produto.estoque_atual + parseInt(qty);
    
    await Promise.all([
      supabase.from("produtos").update({ estoque_atual: newQty, atualizado_por: user?.id }).eq("id", produto.id),
      supabase.from("estoque_movimentacao").insert({
        produto_id: produto.id,
        tipo: "entrada",
        quantidade: parseInt(qty),
        motivo: "Entrada manual",
        usuario_id: user?.id,
      }),
    ]);
    toast.success(`+${qty} unidades adicionadas`);
    fetchProdutos();
  };

  return (
    <div className="page-container">
      <div className="flex items-center justify-between mb-4 slide-up">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight">Produtos</h1>
          <p className="text-sm text-muted-foreground">{produtos.length} itens cadastrados</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="w-4 h-4 mr-1" /> Novo
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{editingProduct ? "Editar Produto" : "Novo Produto"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-3">
              <Input placeholder="Nome do produto" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} required />
              <div className="grid grid-cols-2 gap-3">
                <Input placeholder="Preço custo" type="number" step="0.01" value={form.preco_custo} onChange={(e) => setForm({ ...form, preco_custo: e.target.value })} />
                <Input placeholder="Preço venda" type="number" step="0.01" value={form.preco_venda} onChange={(e) => setForm({ ...form, preco_venda: e.target.value })} required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input placeholder="Estoque atual" type="number" value={form.estoque_atual} onChange={(e) => setForm({ ...form, estoque_atual: e.target.value })} />
                <Input placeholder="Estoque mínimo" type="number" value={form.estoque_minimo} onChange={(e) => setForm({ ...form, estoque_minimo: e.target.value })} />
              </div>
              <Input placeholder="Código de barras" value={form.codigo_barras} onChange={(e) => setForm({ ...form, codigo_barras: e.target.value })} />
              <Input placeholder="Categoria" value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })} />
              <Button type="submit" className="w-full">{editingProduct ? "Salvar" : "Cadastrar"}</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative mb-4 slide-up delay-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Buscar por nome, código ou categoria..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
      </div>

      <div className="space-y-2">
        {filtered.map((p, i) => (
          <Card key={p.id} className={`slide-up delay-${Math.min(i + 2, 6)}`}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${p.estoque_atual <= p.estoque_minimo ? "bg-destructive/10" : "bg-primary/10"}`}>
                <Package className={`w-5 h-5 ${p.estoque_atual <= p.estoque_minimo ? "text-destructive" : "text-primary"}`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate">{p.nome}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-muted-foreground">
                    R$ {Number(p.preco_venda).toFixed(2)}
                  </span>
                  <span className={`text-xs font-medium ${p.estoque_atual <= p.estoque_minimo ? "text-destructive" : "text-primary"}`}>
                    Est: {p.estoque_atual}
                  </span>
                  {p.categoria && <span className="text-xs bg-secondary px-1.5 py-0.5 rounded">{p.categoria}</span>}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleAddStock(p)}>
                  <BarChart3 className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(p)}>
                  <Edit className="w-4 h-4" />
                </Button>
                {isAdmin && (
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(p.id)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
        {filtered.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <Package className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium">Nenhum produto encontrado</p>
            <p className="text-sm">Cadastre seu primeiro produto</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProdutosPage;

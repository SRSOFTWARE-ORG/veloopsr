import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Plus, Search, Package, Edit, Trash2, BarChart3, Grid3X3, List } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import ProductCatalogCard from "@/components/products/ProductCatalogCard";
import ProductForm from "@/components/products/ProductForm";

export interface Produto {
  id: string;
  nome: string;
  preco_custo: number;
  preco_venda: number;
  preco_credito: number | null;
  preco_boleto: number | null;
  preco_pix: number | null;
  preco_carne: number | null;
  estoque_atual: number;
  estoque_minimo: number;
  codigo_barras: string | null;
  categoria: string | null;
  subcategoria: string | null;
  imagem_url: string | null;
}

export interface ProductFormData {
  nome: string;
  preco_custo: string;
  preco_venda: string;
  preco_credito: string;
  preco_boleto: string;
  preco_pix: string;
  preco_carne: string;
  estoque_atual: string;
  estoque_minimo: string;
  codigo_barras: string;
  categoria: string;
  subcategoria: string;
}

const emptyForm: ProductFormData = {
  nome: "",
  preco_custo: "",
  preco_venda: "",
  preco_credito: "",
  preco_boleto: "",
  preco_pix: "",
  preco_carne: "",
  estoque_atual: "",
  estoque_minimo: "5",
  codigo_barras: "",
  categoria: "",
  subcategoria: "",
};

const ProdutosPage = () => {
  const { isAdmin, isPrimaryAdmin, isReadOnly, user } = useAuth();
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Produto | null>(null);
  const [form, setForm] = useState<ProductFormData>(emptyForm);
  const [selectedCategoria, setSelectedCategoria] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);

  useEffect(() => {
    fetchProdutos();
  }, []);

  const fetchProdutos = async () => {
    const { data } = await supabase.from("produtos").select("*").order("nome");
    setProdutos((data as Produto[]) || []);
  };

  const categorias = [...new Set(produtos.map((p) => p.categoria).filter(Boolean))] as string[];

  const filtered = produtos.filter((p) => {
    const matchesSearch =
      p.nome.toLowerCase().includes(search.toLowerCase()) ||
      p.codigo_barras?.includes(search) ||
      p.categoria?.toLowerCase().includes(search.toLowerCase());
    const matchesCategoria = !selectedCategoria || p.categoria === selectedCategoria;
    return matchesSearch && matchesCategoria;
  });

  const resetForm = () => {
    setForm(emptyForm);
    setEditingProduct(null);
  };

  const openEdit = (p: Produto) => {
    setEditingProduct(p);
    setForm({
      nome: p.nome,
      preco_custo: p.preco_custo.toString(),
      preco_venda: p.preco_venda.toString(),
      preco_credito: p.preco_credito?.toString() || "",
      preco_boleto: p.preco_boleto?.toString() || "",
      preco_pix: p.preco_pix?.toString() || "",
      preco_carne: p.preco_carne?.toString() || "",
      estoque_atual: p.estoque_atual.toString(),
      estoque_minimo: p.estoque_minimo.toString(),
      codigo_barras: p.codigo_barras || "",
      categoria: p.categoria || "",
      subcategoria: p.subcategoria || "",
    });
    setDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    let imagem_url = editingProduct?.imagem_url || null;

    // Upload image if selected
    if (imageFile) {
      const ext = imageFile.name.split(".").pop();
      const path = `${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("produto_imagens")
        .upload(path, imageFile, { upsert: true });
      if (upErr) { toast.error("Erro ao enviar imagem"); return; }
      const { data: urlData } = supabase.storage.from("produto_imagens").getPublicUrl(path);
      imagem_url = urlData.publicUrl;
    }

    const payload = {
      nome: form.nome.trim(),
      preco_custo: parseFloat(form.preco_custo) || 0,
      preco_venda: parseFloat(form.preco_venda),
      preco_credito: parseFloat(form.preco_credito) || null,
      preco_boleto: parseFloat(form.preco_boleto) || null,
      preco_pix: parseFloat(form.preco_pix) || null,
      preco_carne: parseFloat(form.preco_carne) || null,
      estoque_atual: parseInt(form.estoque_atual) || 0,
      estoque_minimo: parseInt(form.estoque_minimo) || 5,
      codigo_barras: form.codigo_barras.trim() || null,
      categoria: form.categoria.trim() || null,
      subcategoria: form.subcategoria.trim() || null,
      atualizado_por: user?.id,
      imagem_url,
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
    setImageFile(null);
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
    <div className="page-container pb-24">
      {/* Header */}
      <div className="flex items-center justify-between mb-5 slide-up">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight">Catálogo</h1>
          <p className="text-sm text-muted-foreground">{produtos.length} produtos</p>
        </div>
        {isPrimaryAdmin && (
          <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="w-4 h-4 mr-1" /> Novo
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingProduct ? "Editar Produto" : "Novo Produto"}</DialogTitle>
              </DialogHeader>
              <ProductForm
                form={form}
                setForm={setForm}
                onSubmit={handleSubmit}
                isEditing={!!editingProduct}
                imageFile={imageFile}
                setImageFile={setImageFile}
                currentImageUrl={editingProduct?.imagem_url}
              />
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Search */}
      <div className="relative mb-4 slide-up delay-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Buscar produto..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Category filter chips */}
      {categorias.length > 0 && (
        <div className="flex gap-2 mb-5 overflow-x-auto pb-1 slide-up delay-2 scrollbar-hide">
          <button
            onClick={() => setSelectedCategoria(null)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 active:scale-95 ${
              !selectedCategoria
                ? "bg-primary text-primary-foreground shadow-sm"
                : "bg-secondary text-muted-foreground hover:text-foreground"
            }`}
          >
            Todos
          </button>
          {categorias.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategoria(selectedCategoria === cat ? null : cat)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 active:scale-95 ${
                selectedCategoria === cat
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-secondary text-muted-foreground hover:text-foreground"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      {/* Catalog Grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {filtered.map((p, i) => (
          <ProductCatalogCard
            key={p.id}
            produto={p}
            index={i}
            isAdmin={isPrimaryAdmin}
            onEdit={openEdit}
            onDelete={handleDelete}
            onAddStock={handleAddStock}
          />
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-16 text-muted-foreground slide-up delay-2">
          <Package className="w-14 h-14 mx-auto mb-3 opacity-20" />
          <p className="font-semibold text-sm">Nenhum produto encontrado</p>
          <p className="text-xs mt-1">
            {isPrimaryAdmin ? "Cadastre seu primeiro produto" : "Nenhum item no catálogo"}
          </p>
        </div>
      )}
    </div>
  );
};

export default ProdutosPage;

import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Plus, Search, Package, Edit, Trash2, BarChart3, Grid3X3, List, ScanLine, Loader2, Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
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

  // Scan states
  const [scanDialogOpen, setScanDialogOpen] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scannedProducts, setScannedProducts] = useState<Array<{ codigo_barras: string; referencia: string; nome: string; selected: boolean }>>([]);
  const [importing, setImporting] = useState(false);
  const scanFileRef = useRef<HTMLInputElement>(null);

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

  const handleScanFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validTypes = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
    if (!validTypes.includes(file.type)) {
      toast.error("Envie um arquivo JPG, PNG ou PDF");
      return;
    }

    setScanning(true);
    setScanDialogOpen(true);
    setScannedProducts([]);

    try {
      // Upload temp file
      const ext = file.name.split(".").pop();
      const path = `scan_temp/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("produto_imagens")
        .upload(path, file, { upsert: true });
      if (upErr) throw new Error("Erro ao enviar arquivo");

      const { data: urlData } = supabase.storage.from("produto_imagens").getPublicUrl(path);

      const res = await supabase.functions.invoke("scan-products", {
        body: { file_url: urlData.publicUrl, nome_arquivo: file.name },
      });

      if (res.error || res.data?.error) {
        throw new Error(res.data?.error || res.error?.message || "Erro ao escanear");
      }

      const products = res.data?.data?.produtos || [];
      if (products.length === 0) {
        toast.error("Nenhum produto encontrado no documento");
        setScanDialogOpen(false);
      } else {
        setScannedProducts(products.map((p: any) => ({ ...p, selected: true })));
        toast.success(`${products.length} produto(s) encontrado(s)!`);
      }

      // Clean up temp file
      await supabase.storage.from("produto_imagens").remove([path]);
    } catch (err: any) {
      toast.error(err.message || "Erro ao escanear produtos");
      setScanDialogOpen(false);
    } finally {
      setScanning(false);
      if (scanFileRef.current) scanFileRef.current.value = "";
    }
  };

  const handleImportScanned = async () => {
    const selected = scannedProducts.filter((p) => p.selected);
    if (selected.length === 0) {
      toast.error("Selecione pelo menos um produto");
      return;
    }

    setImporting(true);
    try {
      for (const p of selected) {
        const nome = p.nome.trim();
        const codigo = p.codigo_barras?.trim() || null;

        // Check for existing product by codigo_barras or nome
        let existing: any = null;
        if (codigo) {
          const { data } = await supabase.from("produtos").select("id").eq("codigo_barras", codigo).maybeSingle();
          existing = data;
        }
        if (!existing) {
          const { data } = await supabase.from("produtos").select("id").eq("nome", nome).maybeSingle();
          existing = data;
        }

        const payload = {
          nome,
          codigo_barras: codigo,
          preco_venda: 0,
          preco_custo: 0,
          estoque_atual: 0,
          estoque_minimo: 5,
          atualizado_por: user?.id,
        };

        if (existing) {
          await supabase.from("produtos").update(payload).eq("id", existing.id);
        } else {
          await supabase.from("produtos").insert(payload);
        }
      }

      toast.success(`${selected.length} produto(s) importado(s)!`);
      setScanDialogOpen(false);
      setScannedProducts([]);
      fetchProdutos();
    } catch (err: any) {
      toast.error(err.message || "Erro ao importar");
    } finally {
      setImporting(false);
    }
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
          <div className="flex gap-2">
            <input
              ref={scanFileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              onChange={handleScanFile}
              className="hidden"
            />
            <Button size="sm" variant="outline" onClick={() => scanFileRef.current?.click()}>
              <ScanLine className="w-4 h-4 mr-1" /> Escanear
            </Button>
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
          </div>
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

      {/* Scan Results Dialog */}
      <Dialog open={scanDialogOpen} onOpenChange={setScanDialogOpen}>
        <DialogContent className="max-w-md w-[calc(100%-2rem)] max-h-[85vh] overflow-y-auto rounded-2xl shadow-[0_20px_60px_-10px_rgba(0,0,0,0.3)] border-0 bg-card/95 backdrop-blur-sm" style={{ perspective: "800px" }}>
          <DialogHeader className="pb-1">
            <DialogTitle className="text-lg font-bold text-center">Produtos Escaneados</DialogTitle>
          </DialogHeader>
          {scanning ? (
            <div className="flex flex-col items-center py-14 gap-4">
              <Loader2 className="w-10 h-10 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground font-medium">Analisando documento...</p>
            </div>
          ) : (
            <div className="space-y-4 px-1">
              <p className="text-sm text-muted-foreground text-center">
                {scannedProducts.length} produto(s) encontrado(s). Selecione os que deseja importar.
              </p>
              <div className="space-y-2.5 max-h-[50vh] overflow-y-auto pr-1">
                {scannedProducts.map((p, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 p-4 rounded-xl bg-background border border-border/40 shadow-md hover:shadow-lg transition-all duration-200 hover:scale-[1.02] cursor-pointer"
                    style={{ perspective: "800px" }}
                    onClick={() => {
                      setScannedProducts((prev) =>
                        prev.map((item, idx) => idx === i ? { ...item, selected: !item.selected } : item)
                      );
                    }}
                  >
                    <Checkbox
                      checked={p.selected}
                      onCheckedChange={(checked) => {
                        setScannedProducts((prev) =>
                          prev.map((item, idx) => idx === i ? { ...item, selected: checked === true } : item)
                        );
                      }}
                      className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">{p.nome}</p>
                      {p.codigo_barras && (
                        <p className="text-xs text-muted-foreground mt-0.5">Código: {p.codigo_barras}</p>
                      )}
                      {p.referencia && p.referencia !== "0" && (
                        <p className="text-xs text-muted-foreground">Ref: {p.referencia}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex gap-3 pt-3">
                <Button
                  variant="outline"
                  className="flex-1 h-11 rounded-xl font-semibold"
                  onClick={() => setScanDialogOpen(false)}
                >
                  Cancelar
                </Button>
                <Button
                  className="flex-1 h-11 rounded-xl gap-2 font-semibold shadow-md hover:shadow-lg transition-all"
                  onClick={handleImportScanned}
                  disabled={importing || scannedProducts.filter((p) => p.selected).length === 0}
                >
                  {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  {importing ? "Importando..." : `Importar (${scannedProducts.filter((p) => p.selected).length})`}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ProdutosPage;

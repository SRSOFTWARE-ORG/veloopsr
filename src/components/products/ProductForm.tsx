import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { ProductFormData } from "@/pages/ProdutosPage";

interface Props {
  form: ProductFormData;
  setForm: (f: ProductFormData) => void;
  onSubmit: (e: React.FormEvent) => void;
  isEditing: boolean;
}

const ProductForm = ({ form, setForm, onSubmit, isEditing }: Props) => (
  <form onSubmit={onSubmit} className="space-y-3">
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
    <Input placeholder="Subcategoria" value={form.subcategoria} onChange={(e) => setForm({ ...form, subcategoria: e.target.value })} />
    <Button type="submit" className="w-full">{isEditing ? "Salvar" : "Cadastrar"}</Button>
  </form>
);

export default ProductForm;

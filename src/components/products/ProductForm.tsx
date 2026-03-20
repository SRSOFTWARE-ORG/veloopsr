import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import type { ProductFormData } from "@/pages/ProdutosPage";

interface Props {
  form: ProductFormData;
  setForm: (f: ProductFormData) => void;
  onSubmit: (e: React.FormEvent) => void;
  isEditing: boolean;
}

const ProductForm = ({ form, setForm, onSubmit, isEditing }: Props) => (
  <form onSubmit={onSubmit} className="space-y-4">
    <Input placeholder="Nome do produto" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} required />

    <div className="space-y-2">
      <Label className="text-xs text-muted-foreground uppercase tracking-wider">Preço de custo</Label>
      <Input placeholder="0.00" type="number" step="0.01" value={form.preco_custo} onChange={(e) => setForm({ ...form, preco_custo: e.target.value })} />
    </div>

    <div className="space-y-2">
      <Label className="text-xs text-muted-foreground uppercase tracking-wider">Preços de venda</Label>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-[11px] text-muted-foreground">Crédito</Label>
          <Input placeholder="0.00" type="number" step="0.01" value={form.preco_credito} onChange={(e) => setForm({ ...form, preco_credito: e.target.value })} />
        </div>
        <div>
          <Label className="text-[11px] text-muted-foreground">Boleto</Label>
          <Input placeholder="0.00" type="number" step="0.01" value={form.preco_boleto} onChange={(e) => setForm({ ...form, preco_boleto: e.target.value })} />
        </div>
        <div>
          <Label className="text-[11px] text-muted-foreground">Pix</Label>
          <Input placeholder="0.00" type="number" step="0.01" value={form.preco_pix} onChange={(e) => setForm({ ...form, preco_pix: e.target.value })} />
        </div>
        <div>
          <Label className="text-[11px] text-muted-foreground">Carnê</Label>
          <Input placeholder="0.00" type="number" step="0.01" value={form.preco_carne} onChange={(e) => setForm({ ...form, preco_carne: e.target.value })} />
        </div>
      </div>
    </div>

    <Input placeholder="Preço venda padrão" type="number" step="0.01" value={form.preco_venda} onChange={(e) => setForm({ ...form, preco_venda: e.target.value })} required />

    <div className="grid grid-cols-2 gap-3">
      <Input placeholder="Estoque atual" type="number" value={form.estoque_atual} onChange={(e) => setForm({ ...form, estoque_atual: e.target.value })} />
      <Input placeholder="Estoque mínimo" type="number" value={form.estoque_minimo} onChange={(e) => setForm({ ...form, estoque_minimo: e.target.value })} />
    </div>
    <div className="flex gap-2">
      <Input placeholder="Código de barras" value={form.codigo_barras} onChange={(e) => setForm({ ...form, codigo_barras: e.target.value })} className="flex-1" />
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="shrink-0 self-center"
        onClick={() => {
          const code = Array.from({ length: 13 }, () => Math.floor(Math.random() * 10)).join("");
          setForm({ ...form, codigo_barras: code });
        }}
      >
        Gerar
      </Button>
    </div>
    <Input placeholder="Categoria" value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })} />
    <Input placeholder="Subcategoria" value={form.subcategoria} onChange={(e) => setForm({ ...form, subcategoria: e.target.value })} />
    <Button type="submit" className="w-full">{isEditing ? "Salvar" : "Cadastrar"}</Button>
  </form>
);

export default ProductForm;

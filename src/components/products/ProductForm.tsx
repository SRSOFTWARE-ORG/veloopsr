import { useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ImagePlus, X } from "lucide-react";
import type { ProductFormData } from "@/pages/ProdutosPage";

interface Props {
  form: ProductFormData;
  setForm: (f: ProductFormData) => void;
  onSubmit: (e: React.FormEvent) => void;
  isEditing: boolean;
  imageFile: File | null;
  setImageFile: (f: File | null) => void;
  currentImageUrl?: string | null;
}

const ProductForm = ({ form, setForm, onSubmit, isEditing, imageFile, setImageFile, currentImageUrl }: Props) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const previewUrl = imageFile ? URL.createObjectURL(imageFile) : currentImageUrl;

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {/* Image upload */}
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground uppercase tracking-wider">Foto do produto</Label>
        <div
          onClick={() => fileRef.current?.click()}
          className="relative group cursor-pointer rounded-xl border-2 border-dashed border-border hover:border-primary/40 transition-colors h-36 flex items-center justify-center overflow-hidden bg-muted/30"
        >
          {previewUrl ? (
            <>
              <img src={previewUrl} alt="Preview" className="h-full w-full object-contain" />
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setImageFile(null); }}
                className="absolute top-2 right-2 bg-background/80 backdrop-blur-sm rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="w-4 h-4" />
              </button>
            </>
          ) : (
            <div className="flex flex-col items-center gap-1.5 text-muted-foreground">
              <ImagePlus className="w-8 h-8 opacity-40" />
              <span className="text-xs font-medium">Clique para adicionar foto</span>
            </div>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) setImageFile(file);
            e.target.value = "";
          }}
        />
      </div>

      <Input placeholder="Nome do produto" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} required />

      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground uppercase tracking-wider">Preço de custo</Label>
        <CurrencyInput value={form.preco_custo} onValueChange={(v) => setForm({ ...form, preco_custo: String(v) })} />
      </div>

      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground uppercase tracking-wider">Preços de venda</Label>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-[11px] text-muted-foreground">Crédito</Label>
            <CurrencyInput value={form.preco_credito} onValueChange={(v) => setForm({ ...form, preco_credito: String(v) })} />
          </div>
          <div>
            <Label className="text-[11px] text-muted-foreground">Boleto</Label>
            <CurrencyInput value={form.preco_boleto} onValueChange={(v) => setForm({ ...form, preco_boleto: String(v) })} />
          </div>
          <div>
            <Label className="text-[11px] text-muted-foreground">Pix</Label>
            <CurrencyInput value={form.preco_pix} onValueChange={(v) => setForm({ ...form, preco_pix: String(v) })} />
          </div>
          <div>
            <Label className="text-[11px] text-muted-foreground">Carnê</Label>
            <CurrencyInput value={form.preco_carne} onValueChange={(v) => setForm({ ...form, preco_carne: String(v) })} />
          </div>
        </div>
      </div>

      <CurrencyInput value={form.preco_venda} onValueChange={(v) => setForm({ ...form, preco_venda: String(v) })} />

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
};

export default ProductForm;

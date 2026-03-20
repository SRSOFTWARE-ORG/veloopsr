import { Package, Edit, Trash2, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Produto } from "@/pages/ProdutosPage";

interface Props {
  produto: Produto;
  index: number;
  isAdmin: boolean;
  onEdit: (p: Produto) => void;
  onDelete: (id: string) => void;
  onAddStock: (p: Produto) => void;
}

const ProductCatalogCard = ({ produto: p, index, isAdmin, onEdit, onDelete, onAddStock }: Props) => {
  const lowStock = p.estoque_atual <= p.estoque_minimo;
  const margin = p.preco_custo > 0
    ? (((p.preco_venda - p.preco_custo) / p.preco_custo) * 100).toFixed(0)
    : null;

  return (
    <div
      className={`group relative bg-card rounded-xl border border-border/60 overflow-hidden transition-all duration-300 hover:shadow-md hover:-translate-y-0.5 active:scale-[0.98] slide-up delay-${Math.min(index + 2, 6)}`}
    >
      {/* Product visual area */}
      <div
        className={`relative h-28 flex items-center justify-center ${
          lowStock ? "bg-destructive/5" : "bg-primary/5"
        }`}
      >
        <Package
          className={`w-10 h-10 ${lowStock ? "text-destructive/40" : "text-primary/30"}`}
        />

        {/* Stock badge */}
        <span
          className={`absolute top-2 right-2 text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
            lowStock
              ? "bg-destructive/10 text-destructive"
              : "bg-primary/10 text-primary"
          }`}
        >
          {p.estoque_atual} un
        </span>

        {/* Admin quick actions overlay */}
        {isAdmin && (
          <div className="absolute inset-0 bg-foreground/0 group-hover:bg-foreground/5 transition-colors duration-200 flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100">
            <Button
              variant="secondary"
              size="icon"
              className="h-8 w-8 shadow-sm"
              onClick={(e) => { e.stopPropagation(); onAddStock(p); }}
            >
              <BarChart3 className="w-3.5 h-3.5" />
            </Button>
            <Button
              variant="secondary"
              size="icon"
              className="h-8 w-8 shadow-sm"
              onClick={(e) => { e.stopPropagation(); onEdit(p); }}
            >
              <Edit className="w-3.5 h-3.5" />
            </Button>
            <Button
              variant="secondary"
              size="icon"
              className="h-8 w-8 shadow-sm text-destructive"
              onClick={(e) => { e.stopPropagation(); onDelete(p.id); }}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-3">
        {p.categoria && (
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
            {p.categoria}
          </span>
        )}
        <p className="text-sm font-semibold leading-tight mt-0.5 line-clamp-2 text-foreground">
          {p.nome}
        </p>
        <div className="flex items-baseline gap-1.5 mt-2">
          <span className="text-base font-extrabold text-foreground tabular-nums">
            R$ {Number(p.preco_venda).toFixed(2)}
          </span>
        </div>
        {isAdmin && margin && (
          <span className="text-[10px] text-muted-foreground">
            margem {margin}%
          </span>
        )}
      </div>
    </div>
  );
};

export default ProductCatalogCard;

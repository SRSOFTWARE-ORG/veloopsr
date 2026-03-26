import * as React from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface CurrencyInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> {
  value: number | string;
  onValueChange: (value: number) => void;
}

const CurrencyInput = React.forwardRef<HTMLInputElement, CurrencyInputProps>(
  ({ value, onValueChange, className, ...props }, ref) => {
    const formatDisplay = (num: number): string => {
      if (num === 0) return "";
      return num.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    const [display, setDisplay] = React.useState(() => {
      const num = typeof value === "string" ? parseFloat(value) || 0 : (value || 0);
      return formatDisplay(num);
    });

    React.useEffect(() => {
      const num = typeof value === "string" ? parseFloat(value) || 0 : (value || 0);
      setDisplay(formatDisplay(num));
    }, [value]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value.replace(/\D/g, "");
      if (!raw) {
        setDisplay("");
        onValueChange(0);
        return;
      }
      const num = parseInt(raw, 10) / 100;
      setDisplay(num.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
      onValueChange(num);
    };

    return (
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-medium">R$</span>
        <Input
          ref={ref}
          type="text"
          inputMode="numeric"
          value={display}
          onChange={handleChange}
          className={cn("pl-10", className)}
          placeholder="0,00"
          {...props}
        />
      </div>
    );
  }
);

CurrencyInput.displayName = "CurrencyInput";

export { CurrencyInput };

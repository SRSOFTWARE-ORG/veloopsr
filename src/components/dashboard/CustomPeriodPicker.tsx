import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Calendar as CalendarIcon, X } from "lucide-react";

interface Props {
  start: string;
  end: string;
  onChange: (start: string, end: string) => void;
  active: boolean;
  onClear: () => void;
}

const monthNames = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

function endOfMonth(y: number, m: number) {
  return new Date(y, m + 1, 0).toISOString().split("T")[0];
}
function startOfMonth(y: number, m: number) {
  return new Date(y, m, 1).toISOString().split("T")[0];
}

const CustomPeriodPicker = ({ start, end, onChange, active, onClear }: Props) => {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"mes" | "intervalo">("mes");
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [startInput, setStartInput] = useState(start);
  const [endInput, setEndInput] = useState(end);

  const label = active ? `${start.split("-").reverse().slice(0,2).join("/")} → ${end.split("-").reverse().slice(0,2).join("/")}` : "Personalizado";

  return (
    <div className="inline-flex items-center gap-1">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
              active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            <CalendarIcon className="w-3 h-3" />
            {label}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-3 bg-background z-50" align="start">
          <div className="flex gap-1 mb-3">
            <button onClick={() => setTab("mes")} className={`flex-1 text-xs py-1 rounded ${tab === "mes" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>Mês</button>
            <button onClick={() => setTab("intervalo")} className={`flex-1 text-xs py-1 rounded ${tab === "intervalo" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>Intervalo</button>
          </div>

          {tab === "mes" ? (
            <>
              <div className="flex items-center justify-between mb-2">
                <Button size="sm" variant="ghost" onClick={() => setYear(year - 1)}>‹</Button>
                <span className="text-sm font-semibold">{year}</span>
                <Button size="sm" variant="ghost" onClick={() => setYear(year + 1)}>›</Button>
              </div>
              <div className="grid grid-cols-3 gap-1">
                {monthNames.map((m, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      onChange(startOfMonth(year, i), endOfMonth(year, i));
                      setOpen(false);
                    }}
                    className="text-xs py-2 rounded hover:bg-primary hover:text-primary-foreground transition-colors bg-muted/50"
                  >
                    {m}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="space-y-2">
              <label className="block text-xs">Início
                <input type="date" value={startInput} onChange={(e) => setStartInput(e.target.value)} className="w-full mt-1 border rounded px-2 py-1 text-xs bg-background" />
              </label>
              <label className="block text-xs">Fim
                <input type="date" value={endInput} onChange={(e) => setEndInput(e.target.value)} className="w-full mt-1 border rounded px-2 py-1 text-xs bg-background" />
              </label>
              <Button size="sm" className="w-full" onClick={() => {
                if (startInput && endInput) { onChange(startInput, endInput); setOpen(false); }
              }}>Aplicar</Button>
            </div>
          )}
        </PopoverContent>
      </Popover>
      {active && (
        <button onClick={onClear} className="p-1 rounded hover:bg-muted" title="Limpar"><X className="w-3 h-3" /></button>
      )}
    </div>
  );
};

export default CustomPeriodPicker;

import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CalendarRange } from "lucide-react";
import { type DateRange, type RangePresetId, rangeFromPreset, customRange, toDateStr } from "@/lib/date-range";

const PRESETS: { id: RangePresetId; label: string }[] = [
  { id: "today", label: "Hoje" },
  { id: "yesterday", label: "Ontem" },
  { id: "last7", label: "Últimos 7 dias" },
  { id: "last30", label: "Últimos 30 dias" },
  { id: "this_month", label: "Este mês" },
  { id: "last_month", label: "Mês passado" },
  { id: "closing_current", label: "Ciclo fechamento (11→10)" },
  { id: "closing_previous", label: "Ciclo anterior" },
];

export function DateRangeFilter({ value, onChange, className }: { value: DateRange; onChange: (r: DateRange) => void; className?: string }) {
  const [open, setOpen] = useState(false);
  const [startStr, setStartStr] = useState(toDateStr(value.start));
  const [endStr, setEndStr] = useState(toDateStr(value.end));

  const pick = (id: RangePresetId) => { onChange(rangeFromPreset(id)); setOpen(false); };
  const applyCustom = () => {
    if (!startStr || !endStr) return;
    onChange(customRange(startStr, endStr));
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) { setStartStr(toDateStr(value.start)); setEndStr(toDateStr(value.end)); } }}>
      <PopoverTrigger asChild>
        <Button variant="outline" className={className}>
          <CalendarRange className="h-4 w-4 mr-2" />
          <span className="truncate max-w-[220px]">{value.label}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[320px] p-3">
        <div className="grid grid-cols-2 gap-1 mb-3">
          {PRESETS.map((p) => (
            <Button
              key={p.id}
              variant={value.presetId === p.id ? "default" : "ghost"}
              size="sm"
              className="justify-start h-8 text-xs"
              onClick={() => pick(p.id)}
            >
              {p.label}
            </Button>
          ))}
        </div>
        <div className="border-t pt-3 space-y-2">
          <div className="text-xs font-medium text-muted-foreground">Período personalizado</div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">De</Label>
              <Input type="date" value={startStr} onChange={(e) => setStartStr(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Até</Label>
              <Input type="date" value={endStr} onChange={(e) => setEndStr(e.target.value)} />
            </div>
          </div>
          <Button size="sm" className="w-full" onClick={applyCustom}>Aplicar</Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

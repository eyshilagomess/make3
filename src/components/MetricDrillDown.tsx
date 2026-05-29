import { ReactNode } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Database, Calculator, Info } from "lucide-react";

export type DrillColumn<T> = {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  className?: string;
};

export type MetricDrillDownProps<T = any> = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  label: string;
  value: string;
  formula: string;
  sources: string[];
  description?: string;
  rows?: T[];
  columns?: DrillColumn<T>[];
  breakdown?: { label: string; value: string; hint?: string }[];
  emptyMessage?: string;
  footer?: ReactNode;
};

export function MetricDrillDown<T = any>({
  open, onOpenChange, label, value, formula, sources, description,
  rows, columns, breakdown, emptyMessage = "Sem registros que compõem esta métrica.", footer,
}: MetricDrillDownProps<T>) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">{label}</DialogTitle>
        </DialogHeader>

        <div className="rounded-lg border bg-muted/30 p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Valor calculado</div>
          <div className="text-3xl font-bold mt-1 font-display">{value}</div>
          {description && <div className="text-sm text-muted-foreground mt-1">{description}</div>}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
          <div className="rounded-lg border p-3">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground mb-1">
              <Calculator className="h-3 w-3" /> Fórmula
            </div>
            <div className="text-sm font-mono whitespace-pre-wrap">{formula}</div>
          </div>
          <div className="rounded-lg border p-3">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground mb-1">
              <Database className="h-3 w-3" /> Origem dos dados
            </div>
            <div className="flex flex-wrap gap-1">
              {sources.map((s) => <Badge key={s} variant="outline" className="text-[10px] font-mono">{s}</Badge>)}
            </div>
          </div>
        </div>

        {breakdown && breakdown.length > 0 && (
          <div className="mt-4">
            <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Decomposição</div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {breakdown.map((b, i) => (
                <div key={i} className="rounded-md border bg-muted/30 p-2">
                  <div className="text-[11px] text-muted-foreground">{b.label}</div>
                  <div className="text-base font-semibold tabular-nums">{b.value}</div>
                  {b.hint && <div className="text-[10px] text-muted-foreground">{b.hint}</div>}
                </div>
              ))}
            </div>
          </div>
        )}

        {columns && columns.length > 0 && (
          <div className="mt-4">
            <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
              Registros base ({rows?.length ?? 0})
            </div>
            {(!rows || rows.length === 0) ? (
              <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
                <Info className="h-4 w-4" /> {emptyMessage}
              </div>
            ) : (
              <div className="rounded-md border overflow-x-auto max-h-[40vh] overflow-y-auto">
                <Table>
                  <TableHeader className="sticky top-0 bg-card">
                    <TableRow>
                      {columns.map((c) => <TableHead key={c.key} className={c.className}>{c.header}</TableHead>)}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r, i) => (
                      <TableRow key={i}>
                        {columns.map((c) => <TableCell key={c.key} className={c.className}>{c.render(r)}</TableCell>)}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        )}

        {footer && <div className="mt-4 text-xs text-muted-foreground">{footer}</div>}
      </DialogContent>
    </Dialog>
  );
}
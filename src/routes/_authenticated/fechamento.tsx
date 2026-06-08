import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2, Pencil, ArrowDownCircle, ArrowUpCircle, CalendarClock, TrendingUp, Receipt, Download } from "lucide-react";
import { toast } from "sonner";
import { brl, dateBR } from "@/lib/format";
import { downloadXLSX } from "@/lib/export";
import { closingCycleFor, previousClosingCycle, toISO, endExclusiveISO, toDateStr } from "@/lib/date-range";
import { channelFeeAmount, infinityPayFeeAmount } from "@/lib/wallet";

export const Route = createFileRoute("/_authenticated/fechamento")({
  head: () => ({ meta: [{ title: "Fechamento — Make 3" }] }),
  component: Page,
});

type Form = { kind: "recebido" | "pago"; description: string; amount: string; paid_at: string; status: "pendente" | "confirmado"; notes: string };
const today = () => new Date().toISOString().slice(0, 10);
const empty = (): Form => ({ kind: "recebido", description: "", amount: "", paid_at: today(), status: "confirmado", notes: "" });

function Page() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const now = new Date();

  // ciclo selecionado: por padrão o ciclo atual (11→10)
  const [refDate, setRefDate] = useState<Date>(now);
  const cycle = useMemo(() => closingCycleFor(refDate), [refDate]);
  const prev = useMemo(() => previousClosingCycle(refDate), [refDate]);

  const periodStart = toDateStr(cycle.start);
  const periodEnd = toDateStr(cycle.end);
  const periodLabel = `${dateBR(cycle.start)} → ${dateBR(cycle.end)}`;

  const isClosed = cycle.end.getTime() < Date.now();

  // ---------- agregados do ciclo (vendas, gastos, CMV, taxas) ----------
  const { data: summary } = useQuery({
    queryKey: ["fechamento-summary", periodStart, periodEnd],
    queryFn: async () => {
      const [orders, items, expenses] = await Promise.all([
        supabase.from("orders").select("id,total,channel,payment_method,payment_method_2,payment_amount_1,payment_amount_2,created_at").gte("created_at", toISO(cycle.start)).lt("created_at", endExclusiveISO(cycle.end)),
        supabase.from("order_items").select("quantity,unit_cost,orders!inner(created_at)").gte("orders.created_at", toISO(cycle.start)).lt("orders.created_at", endExclusiveISO(cycle.end)),
        (supabase as any).from("expenses").select("amount,category").gte("expense_date", periodStart).lte("expense_date", periodEnd),
      ]);
      const revenue = (orders.data ?? []).reduce((s, o: any) => s + Number(o.total ?? 0), 0);
      const cogs = (items.data ?? []).reduce((s, i: any) => s + Number(i.unit_cost ?? 0) * Number(i.quantity ?? 0), 0);
      const channelFees = (orders.data ?? []).reduce((s, o: any) => s + channelFeeAmount(o.channel, Number(o.total ?? 0)), 0);
      const machineFees = (orders.data ?? []).reduce((s, o: any) => {
        const m1 = o.payment_method as any;
        const m2 = o.payment_method_2 as any;
        if (m2) {
          const a1 = Number(o.payment_amount_1 ?? 0);
          const a2 = Number(o.payment_amount_2 ?? 0);
          return s + infinityPayFeeAmount(m1, a1) + infinityPayFeeAmount(m2, a2);
        }
        return s + infinityPayFeeAmount(m1, Number(o.total ?? 0));
      }, 0);
      const expensesTotal = (expenses.data ?? []).reduce((s: number, e: any) => s + Number(e.amount ?? 0), 0);
      const realProfit = revenue - cogs - channelFees - machineFees - expensesTotal;
      return { revenue, cogs, channelFees, machineFees, expensesTotal, realProfit, ordersCount: orders.data?.length ?? 0 };
    },
  });

  // ---------- pagamentos manuais do fechamento ----------
  const { data: payments } = useQuery({
    queryKey: ["closing_payments", periodStart, periodEnd],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("closing_payments").select("*").eq("period_start", periodStart).eq("period_end", periodEnd).order("paid_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const totals = useMemo(() => {
    const recebido = (payments ?? []).filter((p: any) => p.kind === "recebido").reduce((s: number, p: any) => s + Number(p.amount ?? 0), 0);
    const pago = (payments ?? []).filter((p: any) => p.kind === "pago").reduce((s: number, p: any) => s + Number(p.amount ?? 0), 0);
    return { recebido, pago, saldo: recebido - pago };
  }, [payments]);

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(empty());

  const openNew = (kind: "recebido" | "pago" = "recebido") => {
    setEditingId(null); setForm({ ...empty(), kind, paid_at: toDateStr(new Date(Math.max(cycle.start.getTime(), Math.min(Date.now(), cycle.end.getTime())))) });
    setOpen(true);
  };
  const openEdit = (p: any) => {
    setEditingId(p.id);
    setForm({ kind: p.kind, description: p.description, amount: String(p.amount ?? ""), paid_at: p.paid_at, status: p.status, notes: p.notes ?? "" });
    setOpen(true);
  };

  const save = useMutation({
    mutationFn: async (f: Form) => {
      if (!f.description.trim()) throw new Error("Descrição obrigatória");
      if (!Number(f.amount)) throw new Error("Valor obrigatório");
      const payload: any = {
        period_start: periodStart, period_end: periodEnd,
        kind: f.kind, description: f.description.trim(),
        amount: Number(f.amount), paid_at: f.paid_at,
        status: f.status, notes: f.notes || null,
      };
      if (editingId) {
        const { error } = await (supabase as any).from("closing_payments").update(payload).eq("id", editingId);
        if (error) throw error;
      } else {
        payload.created_by = user?.id ?? null;
        const { error } = await (supabase as any).from("closing_payments").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => { toast.success(editingId ? "Pagamento atualizado" : "Pagamento registrado"); setOpen(false); setEditingId(null); setForm(empty()); qc.invalidateQueries({ queryKey: ["closing_payments"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => { const { error } = await (supabase as any).from("closing_payments").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { toast.success("Removido"); qc.invalidateQueries({ queryKey: ["closing_payments"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const exportar = () => {
    const resumo = [
      { Métrica: "Receita do ciclo", Valor: summary?.revenue ?? 0 },
      { Métrica: "CMV", Valor: -(summary?.cogs ?? 0) },
      { Métrica: "Taxas de canal", Valor: -(summary?.channelFees ?? 0) },
      { Métrica: "Taxas de maquininha", Valor: -(summary?.machineFees ?? 0) },
      { Métrica: "Gastos operacionais", Valor: -(summary?.expensesTotal ?? 0) },
      { Métrica: "Lucro real", Valor: summary?.realProfit ?? 0 },
      { Métrica: "Pagamentos recebidos (manuais)", Valor: totals.recebido },
      { Métrica: "Pagamentos feitos (manuais)", Valor: -totals.pago },
      { Métrica: "Saldo do fechamento", Valor: totals.saldo },
    ];
    const detalhes = (payments ?? []).map((p: any) => ({ Tipo: p.kind, Descrição: p.description, Valor: p.amount, Data: p.paid_at, Status: p.status, Observação: p.notes ?? "" }));
    downloadXLSX(`fechamento-${periodStart}_${periodEnd}.xlsx`, { Resumo: resumo, Pagamentos: detalhes });
  };

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-7xl mx-auto">
      <PageHeader
        title="Fechamento mensal"
        subtitle={`Ciclo dia 11 → dia 10 · ${periodLabel}`}
        actions={
          <div className="flex items-center gap-2">
            <Select value={refDate.toISOString()} onValueChange={(v) => setRefDate(new Date(v))}>
              <SelectTrigger className="w-[260px]"><CalendarClock className="h-4 w-4 mr-2" /><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={cycle.end.toISOString()}>{`Atual · ${dateBR(cycle.start)} → ${dateBR(cycle.end)}`}</SelectItem>
                <SelectItem value={prev.end.toISOString()}>{`Anterior · ${dateBR(prev.start)} → ${dateBR(prev.end)}`}</SelectItem>
                {Array.from({ length: 6 }).map((_, i) => {
                  const d = new Date(prev.start); d.setMonth(d.getMonth() - (i + 1));
                  const c = closingCycleFor(d);
                  return <SelectItem key={i} value={c.end.toISOString()}>{`${dateBR(c.start)} → ${dateBR(c.end)}`}</SelectItem>;
                })}
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={exportar}><Download className="h-4 w-4 mr-1" /> Baixar</Button>
            <Button className="bg-gradient-brand text-primary-foreground border-0 shadow-glow" onClick={() => openNew("recebido")}>
              <Plus className="h-4 w-4 mr-1" /> Lançar pagamento
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mb-6">
        <StatCard accent label="Lucro real do ciclo" value={brl(summary?.realProfit ?? 0)} icon={TrendingUp} hint={`${summary?.ordersCount ?? 0} pedidos`} />
        <StatCard label="Gastos do ciclo" value={brl(summary?.expensesTotal ?? 0)} icon={Receipt} hint="Categorias operacionais" />
        <StatCard label="Recebido (manual)" value={brl(totals.recebido)} icon={ArrowDownCircle} hint="Lançamentos do fechamento" />
        <StatCard label="Pago (manual)" value={brl(totals.pago)} icon={ArrowUpCircle} hint={`Saldo ${brl(totals.saldo)}`} />
      </div>

      <Card className="p-5 shadow-card mb-6">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="font-semibold">Resumo financeiro do ciclo</h3>
            <p className="text-xs text-muted-foreground">Calculado a partir de pedidos, itens e gastos com data dentro do ciclo.</p>
          </div>
          <Badge variant={isClosed ? "default" : "secondary"}>{isClosed ? "Fechado" : "Em andamento"}</Badge>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
          <Line label="Receita" value={summary?.revenue ?? 0} />
          <Line label="(−) CMV" value={-(summary?.cogs ?? 0)} />
          <Line label="(−) Taxas de canal" value={-(summary?.channelFees ?? 0)} />
          <Line label="(−) Taxas de maquininha" value={-(summary?.machineFees ?? 0)} />
          <Line label="(−) Gastos operacionais" value={-(summary?.expensesTotal ?? 0)} />
          <Line label="= Lucro real" value={summary?.realProfit ?? 0} strong />
        </div>
      </Card>

      <Card className="p-4 shadow-card">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">Pagamentos do fechamento</h3>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => openNew("recebido")}><ArrowDownCircle className="h-4 w-4 mr-1" /> Recebido</Button>
            <Button size="sm" variant="outline" onClick={() => openNew("pago")}><ArrowUpCircle className="h-4 w-4 mr-1" /> Pago</Button>
          </div>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tipo</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead>Data</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(payments ?? []).length === 0 && (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Nenhum pagamento lançado neste ciclo.</TableCell></TableRow>
            )}
            {(payments ?? []).map((p: any) => (
              <TableRow key={p.id}>
                <TableCell>
                  <Badge variant={p.kind === "recebido" ? "default" : "secondary"} className={p.kind === "recebido" ? "bg-success/10 text-success border-success/30" : "bg-warning/10 text-warning border-warning/30"}>
                    {p.kind === "recebido" ? "Recebido" : "Pago"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="font-medium">{p.description}</div>
                  {p.notes && <div className="text-xs text-muted-foreground">{p.notes}</div>}
                </TableCell>
                <TableCell>{dateBR(p.paid_at)}</TableCell>
                <TableCell><Badge variant="outline">{p.status === "confirmado" ? "Confirmado" : "Pendente"}</Badge></TableCell>
                <TableCell className="text-right font-semibold tabular-nums">
                  <span className={p.kind === "recebido" ? "text-success" : "text-warning"}>
                    {p.kind === "recebido" ? "+" : "−"}{brl(p.amount)}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  <Button size="icon" variant="ghost" onClick={() => openEdit(p)}><Pencil className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => { if (confirm("Remover lançamento?")) del.mutate(p.id); }}><Trash2 className="h-4 w-4" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setEditingId(null); setForm(empty()); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editingId ? "Editar pagamento" : "Lançar pagamento"}</DialogTitle></DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); save.mutate(form); }} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Tipo</Label>
                <Select value={form.kind} onValueChange={(v: any) => setForm({ ...form, kind: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="recebido">Recebido</SelectItem>
                    <SelectItem value="pago">Pago</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v: any) => setForm({ ...form, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="confirmado">Confirmado</SelectItem>
                    <SelectItem value="pendente">Pendente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Descrição *</Label>
              <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Ex: Repasse Shopee, Aluguel, Pró-labore…" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Valor (R$) *</Label>
                <Input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Data</Label>
                <Input type="date" value={form.paid_at} min={periodStart} max={periodEnd} onChange={(e) => setForm({ ...form, paid_at: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Observações</Label>
              <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={save.isPending} className="bg-gradient-brand text-primary-foreground border-0">{editingId ? "Salvar" : "Lançar"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Line({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className={`flex justify-between rounded-md px-3 py-2 ${strong ? "bg-primary/10 border border-primary/20" : "bg-muted/30"}`}>
      <span className={strong ? "font-semibold" : "text-muted-foreground"}>{label}</span>
      <span className={`tabular-nums ${strong ? "font-bold" : "font-medium"}`}>{brl(value)}</span>
    </div>
  );
}

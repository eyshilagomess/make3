import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { brl } from "@/lib/format";
import { computeFinance, WALLETS, type Wallet, fmtPct } from "@/lib/finance";
import { CalendarCheck, Lock, Unlock, AlertCircle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/fechamento")({
  head: () => ({ meta: [{ title: "Fechamento diário — Make 3" }] }),
  component: Fechamento,
});

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function Fechamento() {
  const now = new Date();
  const [month, setMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  const qc = useQueryClient();
  const [closingDate, setClosingDate] = useState<string | null>(null);

  const { start, end, days, label } = useMemo(() => {
    const [y, m] = month.split("-").map(Number);
    const s = new Date(y, m - 1, 1);
    const e = new Date(y, m, 1);
    const dList: string[] = [];
    for (let d = new Date(s); d < e; d.setDate(d.getDate() + 1)) dList.push(ymd(d));
    return { start: s.toISOString(), end: e.toISOString(), days: dList, label: s.toLocaleDateString("pt-BR", { month: "long", year: "numeric" }) };
  }, [month]);

  const { data } = useQuery({
    queryKey: ["fechamento", month],
    queryFn: async () => {
      const [orders, expensesRes, closingsRes] = await Promise.all([
        (supabase as any).from("orders")
          .select("id,order_code,subtotal,discount,total,shipping,channel,payment_method,payment_method_2,payment_amount_1,payment_amount_2,status,payment_status,closed_at")
          .gte("closed_at", start).lt("closed_at", end)
          .or("payment_status.eq.pago,status.eq.concluido"),
        (supabase as any).from("expenses").select("amount,category,expense_date").gte("expense_date", start.slice(0, 10)).lt("expense_date", end.slice(0, 10)),
        (supabase as any).from("daily_closings").select("*").gte("closing_date", start.slice(0, 10)).lt("closing_date", end.slice(0, 10)),
      ]);
      const ordersArr = (orders.data ?? []) as any[];
      const orderIds = ordersArr.map((o) => o.id);
      const itemsRes = orderIds.length === 0
        ? { data: [] as any[] }
        : await supabase.from("order_items").select("order_id,unit_cost,quantity").in("order_id", orderIds);
      const items = (itemsRes.data ?? []) as any[];
      const expenses = (expensesRes.data ?? []) as any[];
      const closings = ((closingsRes.data ?? []) as any[]).reduce<Record<string, any>>((acc, c) => { acc[c.closing_date] = c; return acc; }, {});

      // por dia
      const byDay: Record<string, ReturnType<typeof computeFinance>> = {};
      for (const d of days) {
        const dayOrders = ordersArr.filter((o) => (o.closed_at ?? "").slice(0, 10) === d);
        const dayExpenses = expenses.filter((e) => (e.expense_date ?? "").slice(0, 10) === d);
        byDay[d] = computeFinance({ orders: dayOrders, items, expenses: dayExpenses });
      }
      const monthAgg = computeFinance({ orders: ordersArr, items, expenses });
      return { ordersArr, items, expenses, closings, byDay, monthAgg };
    },
  });

  const dayData = closingDate ? data?.byDay[closingDate] : null;
  const existing = closingDate ? data?.closings[closingDate] : null;

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-7xl mx-auto">
      <PageHeader
        title="Fechamento diário"
        subtitle={`${label} · feche o caixa todo dia e confira os saldos por carteira`}
        actions={<Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-[170px]" />}
      />

      <Card className="p-5 shadow-card mb-6">
        <div className="flex items-center gap-2 mb-4">
          <CalendarCheck className="h-4 w-4 text-primary" />
          <h3 className="font-semibold">DRE do mês (acumulado dos dias pagos/concluídos)</h3>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 text-sm">
          <Metric label="Receita líquida" value={brl(data?.monthAgg.netRevenue ?? 0)} />
          <Metric label="CMV" value={brl(data?.monthAgg.cogs ?? 0)} hint={fmtPct(data?.monthAgg.cogsPct ?? 0)} />
          <Metric label="Taxas" value={brl(data?.monthAgg.totalFees ?? 0)} />
          <Metric label="Despesas" value={brl(data?.monthAgg.totalExpenses ?? 0)} />
          <Metric label="Lucro bruto" value={brl(data?.monthAgg.grossProfit ?? 0)} hint={fmtPct(data?.monthAgg.grossMarginPct ?? 0)} />
          <Metric label="Lucro líquido" value={brl(data?.monthAgg.netProfit ?? 0)} hint={fmtPct(data?.monthAgg.netMarginPct ?? 0)} highlight />
        </div>
      </Card>

      <Card className="p-5 shadow-card mb-6 overflow-x-auto">
        <div className="flex items-center gap-2 mb-4">
          <CalendarCheck className="h-4 w-4 text-primary" />
          <h3 className="font-semibold">Dias do mês</h3>
          <span className="text-xs text-muted-foreground ml-2">Clique em "Fechar" para travar o dia e conferir o caixa</span>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead className="text-right">Pedidos</TableHead>
              <TableHead className="text-right">Receita</TableHead>
              <TableHead className="text-right">CMV</TableHead>
              <TableHead className="text-right">Taxas</TableHead>
              <TableHead className="text-right">Despesas</TableHead>
              <TableHead className="text-right">Lucro</TableHead>
              <TableHead>Status</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {days.map((d) => {
              const m = data?.byDay[d];
              const c = data?.closings[d];
              const empty = !m || (m.ordersCount === 0 && m.totalExpenses === 0);
              const date = new Date(d + "T00:00:00");
              const isFuture = date > new Date();
              return (
                <TableRow key={d} className={empty ? "opacity-50" : ""}>
                  <TableCell className="font-mono text-xs">{date.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" })}</TableCell>
                  <TableCell className="text-right">{m?.ordersCount ?? 0}</TableCell>
                  <TableCell className="text-right tabular-nums">{brl(m?.netRevenue ?? 0)}</TableCell>
                  <TableCell className="text-right tabular-nums">{brl(m?.cogs ?? 0)}</TableCell>
                  <TableCell className="text-right tabular-nums">{brl(m?.totalFees ?? 0)}</TableCell>
                  <TableCell className="text-right tabular-nums">{brl(m?.totalExpenses ?? 0)}</TableCell>
                  <TableCell className="text-right tabular-nums font-semibold">{brl(m?.netProfit ?? 0)}</TableCell>
                  <TableCell>
                    {c ? <Badge className="bg-success/15 text-success border-success/30"><Lock className="h-3 w-3 mr-1" />Fechado</Badge>
                       : <Badge variant="outline"><Unlock className="h-3 w-3 mr-1" />Aberto</Badge>}
                  </TableCell>
                  <TableCell>
                    {!isFuture && (
                      <Button size="sm" variant={c ? "outline" : "default"} onClick={() => setClosingDate(d)}>
                        {c ? "Revisar" : "Fechar dia"}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      {closingDate && dayData && (
        <CloseDayDialog
          date={closingDate}
          dayData={dayData}
          existing={existing}
          onClose={() => setClosingDate(null)}
          onSaved={() => { qc.invalidateQueries({ queryKey: ["fechamento", month] }); setClosingDate(null); }}
        />
      )}
    </div>
  );
}

function Metric({ label, value, hint, highlight }: { label: string; value: string; hint?: string; highlight?: boolean }) {
  return (
    <div className={`rounded-lg border p-3 ${highlight ? "bg-primary/5 border-primary/30" : "bg-muted/30"}`}>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-lg font-bold tabular-nums mt-1 ${highlight ? "text-primary" : ""}`}>{value}</div>
      {hint && <div className="text-[10px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

function CloseDayDialog({ date, dayData, existing, onClose, onSaved }: {
  date: string; dayData: ReturnType<typeof computeFinance>; existing: any | null; onClose: () => void; onSaved: () => void;
}) {
  const [counted, setCounted] = useState<Record<Wallet, string>>(() => {
    const init: Record<Wallet, string> = { "Papel": "", "Mercado Pago": "", "Infinity Pay": "", "Outros": "" };
    if (existing?.wallet_counted) for (const w of WALLETS) init[w] = String(existing.wallet_counted[w] ?? "");
    return init;
  });
  const [notes, setNotes] = useState<string>(existing?.notes ?? "");
  const [saving, setSaving] = useState(false);

  const diff: Record<Wallet, number> = WALLETS.reduce((acc, w) => {
    const c = Number(counted[w] || 0);
    acc[w] = c - (dayData.byWallet[w] ?? 0);
    return acc;
  }, {} as Record<Wallet, number>);

  const save = async () => {
    setSaving(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const payload = {
        closing_date: date,
        orders_count: dayData.ordersCount,
        gross_revenue: dayData.grossRevenue,
        discounts: dayData.totalDiscount,
        shipping: dayData.totalShipping,
        net_revenue: dayData.netRevenue,
        cogs: dayData.cogs,
        channel_fees: dayData.totalChannelFees,
        machine_fees: dayData.totalMachineFees,
        expenses: dayData.totalExpenses,
        gross_profit: dayData.grossProfit,
        net_profit: dayData.netProfit,
        wallet_calculated: dayData.byWallet,
        wallet_counted: Object.fromEntries(WALLETS.map((w) => [w, Number(counted[w] || 0)])),
        wallet_diff: diff,
        notes: notes || null,
        closed_by: u.user?.id ?? null,
      };
      const { error } = await (supabase as any).from("daily_closings").upsert(payload, { onConflict: "closing_date" });
      if (error) throw error;
      toast.success(`Dia ${date} fechado`);
      onSaved();
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao fechar");
    } finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Fechar {new Date(date + "T00:00:00").toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
          <Metric label="Pedidos" value={String(dayData.ordersCount)} />
          <Metric label="Receita líquida" value={brl(dayData.netRevenue)} />
          <Metric label="CMV" value={brl(dayData.cogs)} hint={fmtPct(dayData.cogsPct)} />
          <Metric label="Taxas (canal+maquininha)" value={brl(dayData.totalFees)} />
          <Metric label="Despesas do dia" value={brl(dayData.totalExpenses)} />
          <Metric label="Lucro líquido" value={brl(dayData.netProfit)} hint={fmtPct(dayData.netMarginPct)} highlight />
        </div>

        <div className="mt-4">
          <h4 className="font-semibold text-sm mb-2">Conferência de caixa por carteira</h4>
          <p className="text-xs text-muted-foreground mb-3">Conte o saldo real e compare com o que o sistema calculou. Se bater, o dia fecha em paz; se não, registramos a diferença.</p>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Carteira</TableHead>
                  <TableHead className="text-right">Calculado</TableHead>
                  <TableHead className="text-right">Contado</TableHead>
                  <TableHead className="text-right">Diferença</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {WALLETS.map((w) => {
                  const d = diff[w];
                  const matches = Math.abs(d) < 0.01;
                  return (
                    <TableRow key={w}>
                      <TableCell className="font-medium">{w}</TableCell>
                      <TableCell className="text-right tabular-nums">{brl(dayData.byWallet[w] ?? 0)}</TableCell>
                      <TableCell className="text-right">
                        <Input inputMode="decimal" value={counted[w]} onChange={(e) => setCounted({ ...counted, [w]: e.target.value })} className="h-8 w-32 ml-auto text-right" placeholder="0,00" />
                      </TableCell>
                      <TableCell className={`text-right tabular-nums font-medium ${matches ? "text-success" : Math.abs(d) > 0 ? "text-destructive" : ""}`}>
                        {counted[w] === "" ? "—" : (
                          <span className="inline-flex items-center gap-1">
                            {matches ? <CheckCircle2 className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
                            {brl(d)}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>

        <div className="mt-4">
          <label className="text-xs font-medium text-muted-foreground">Observações (opcional)</label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Sobra de troco, falta de R$ 5 no Papel, etc." className="mt-1" rows={2} />
        </div>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>
            <Lock className="h-4 w-4 mr-1" /> {existing ? "Atualizar fechamento" : "Fechar dia"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
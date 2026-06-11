import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowDownCircle, ArrowUpCircle, CalendarClock, TrendingUp, Receipt, Download, ExternalLink } from "lucide-react";
import { brl, dateBR } from "@/lib/format";
import { downloadXLSX } from "@/lib/export";
import { closingCycleFor, previousClosingCycle, toISO, endExclusiveISO, toDateStr } from "@/lib/date-range";
import { channelFeeAmount, infinityPayFeeAmount } from "@/lib/wallet";

export const Route = createFileRoute("/_authenticated/fechamento")({
  head: () => ({ meta: [{ title: "Fechamento — Make 3" }] }),
  component: Page,
});

function Page() {
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
        (supabase as any).from("expenses").select("amount,category").eq("kind", "saida").gte("expense_date", periodStart).lte("expense_date", periodEnd),
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
          return s + infinityPayFeeAmount(o.channel, m1, a1) + infinityPayFeeAmount(o.channel, m2, a2);
        }
        return s + infinityPayFeeAmount(o.channel, m1, Number(o.total ?? 0));
      }, 0);
      const expensesTotal = (expenses.data ?? []).reduce((s: number, e: any) => s + Number(e.amount ?? 0), 0);
      const realProfit = revenue - cogs - channelFees - machineFees - expensesTotal;
      return { revenue, cogs, channelFees, machineFees, expensesTotal, realProfit, ordersCount: orders.data?.length ?? 0 };
    },
  });

  // ---------- lançamentos do fechamento (vindos da tabela expenses) ----------
  const { data: payments } = useQuery({
    queryKey: ["fechamento-payments", periodStart, periodEnd],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("expenses").select("*").gte("expense_date", periodStart).lte("expense_date", periodEnd).order("expense_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const totals = useMemo(() => {
    const recebido = (payments ?? []).filter((p: any) => p.kind === "entrada").reduce((s: number, p: any) => s + Number(p.amount ?? 0), 0);
    const pago = (payments ?? []).filter((p: any) => p.kind === "saida").reduce((s: number, p: any) => s + Number(p.amount ?? 0), 0);
    return { recebido, pago, saldo: recebido - pago };
  }, [payments]);

  const exportar = () => {
    const resumo = [
      { Métrica: "Receita do ciclo", Valor: summary?.revenue ?? 0 },
      { Métrica: "CMV", Valor: -(summary?.cogs ?? 0) },
      { Métrica: "Taxas de canal", Valor: -(summary?.channelFees ?? 0) },
      { Métrica: "Taxas de maquininha", Valor: -(summary?.machineFees ?? 0) },
      { Métrica: "Gastos operacionais", Valor: -(summary?.expensesTotal ?? 0) },
      { Métrica: "Lucro real", Valor: summary?.realProfit ?? 0 },
      { Métrica: "Entradas manuais", Valor: totals.recebido },
      { Métrica: "Saídas manuais", Valor: -totals.pago },
      { Métrica: "Saldo do fechamento", Valor: totals.saldo },
    ];
    const detalhes = (payments ?? []).map((p: any) => ({ Tipo: p.kind, Categoria: p.category, Valor: p.amount, Data: p.expense_date, Status: p.status, Observação: p.notes ?? "" }));
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
            <Link to="/gastos"><Button className="bg-gradient-brand text-primary-foreground border-0 shadow-glow"><ExternalLink className="h-4 w-4 mr-1" /> Lançar em Gastos</Button></Link>
          </div>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mb-6">
        <StatCard accent label="Lucro real do ciclo" value={brl(summary?.realProfit ?? 0)} icon={TrendingUp} hint={`${summary?.ordersCount ?? 0} pedidos`} />
        <StatCard label="Saídas do ciclo" value={brl(totals.pago)} icon={Receipt} hint="Lançamentos em Gastos (saída)" />
        <StatCard label="Entradas (manual)" value={brl(totals.recebido)} icon={ArrowDownCircle} hint="Lançamentos em Gastos (entrada)" />
        <StatCard label="Saldo manual" value={brl(totals.saldo)} icon={ArrowUpCircle} hint="Entradas − Saídas" />
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
          <div>
            <h3 className="font-semibold">Lançamentos do ciclo</h3>
            <p className="text-xs text-muted-foreground">Vindos da página Gastos · {(payments ?? []).length} registros</p>
          </div>
          <Link to="/gastos"><Button size="sm" variant="outline"><ExternalLink className="h-4 w-4 mr-1" /> Gerenciar em Gastos</Button></Link>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tipo</TableHead>
              <TableHead>Categoria</TableHead>
              <TableHead>Data</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Valor</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(payments ?? []).length === 0 && (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Nenhum lançamento neste ciclo.</TableCell></TableRow>
            )}
            {(payments ?? []).map((p: any) => (
              <TableRow key={p.id}>
                <TableCell>
                  <Badge variant={p.kind === "entrada" ? "default" : "secondary"} className={p.kind === "entrada" ? "bg-success/10 text-success border-success/30" : "bg-warning/10 text-warning border-warning/30"}>
                    {p.kind === "entrada" ? "Entrada" : "Saída"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="font-medium">{p.category}</div>
                  {p.notes && <div className="text-xs text-muted-foreground">{p.notes}</div>}
                </TableCell>
                <TableCell>{dateBR(p.expense_date)}</TableCell>
                <TableCell><Badge variant="outline">{p.status === "pendente" ? "Pendente" : "Confirmado"}</Badge></TableCell>
                <TableCell className="text-right font-semibold tabular-nums">
                  <span className={p.kind === "entrada" ? "text-success" : "text-warning"}>
                    {p.kind === "entrada" ? "+" : "−"}{brl(p.amount)}
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
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

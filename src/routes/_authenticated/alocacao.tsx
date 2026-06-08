import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { brl } from "@/lib/format";
import { channelFeeAmount } from "@/lib/wallet";
import { TrendingUp, PiggyBank, Wallet, Receipt, Save } from "lucide-react";
import { toast } from "sonner";
import { DateRangeFilter } from "@/components/DateRangeFilter";
import { rangeFromPreset, DEFAULT_PRESET, toISO, endExclusiveISO, toDateStr, type DateRange } from "@/lib/date-range";

export const Route = createFileRoute("/_authenticated/alocacao")({
  head: () => ({ meta: [{ title: "Alocação — Make 3" }] }),
  component: Page,
});

function Page() {
  const qc = useQueryClient();
  const [range, setRange] = useState<DateRange>(() => rangeFromPreset(DEFAULT_PRESET));
  const start = toISO(range.start);
  const end = endExclusiveISO(range.end);
  const startDate = toDateStr(range.start);
  const endDate = toDateStr(range.end);
  const label = range.label;

  const { data } = useQuery({
    queryKey: ["alocacao", start, end],
    queryFn: async () => {
      const [orders, items, expenses, cfg] = await Promise.all([
        supabase.from("orders").select("id,total,channel,created_at").gte("created_at", start).lt("created_at", end),
        supabase.from("order_items").select("quantity,unit_cost,orders!inner(created_at)").gte("orders.created_at", start).lt("orders.created_at", end),
        (supabase as any).from("expenses").select("amount").gte("expense_date", startDate).lte("expense_date", endDate),
        (supabase as any).from("allocation_config").select("*").limit(1).maybeSingle(),
      ]);
      const revenue = (orders.data ?? []).reduce((s, o: any) => s + Number(o.total ?? 0), 0);
      const fees = (orders.data ?? []).reduce((s, o: any) => s + channelFeeAmount(o.channel, Number(o.total ?? 0)), 0);
      const cogs = (items.data ?? []).reduce((s, i: any) => s + Number(i.unit_cost ?? 0) * Number(i.quantity ?? 0), 0);
      const expensesTotal = (expenses.data ?? []).reduce((s: number, e: any) => s + Number(e.amount ?? 0), 0);
      const realProfit = revenue - cogs - fees;
      const netProfit = realProfit - expensesTotal;
      return { revenue, cogs, fees, expensesTotal, realProfit, netProfit, cfg: cfg.data };
    },
  });

  const [pct, setPct] = useState({ investment: 30, prolabore: 40, expenses: 30 });
  useEffect(() => {
    if (data?.cfg) setPct({ investment: Number(data.cfg.investment_pct), prolabore: Number(data.cfg.prolabore_pct), expenses: Number(data.cfg.expenses_pct) });
  }, [data?.cfg]);

  const sum = pct.investment + pct.prolabore + pct.expenses;
  const base = Math.max(0, data?.netProfit ?? 0);
  const alloc = {
    investment: base * (pct.investment / 100),
    prolabore: base * (pct.prolabore / 100),
    expenses: base * (pct.expenses / 100),
  };

  const save = useMutation({
    mutationFn: async () => {
      if (sum !== 100) throw new Error("As porcentagens precisam somar 100%");
      const payload = { investment_pct: pct.investment, prolabore_pct: pct.prolabore, expenses_pct: pct.expenses };
      if (data?.cfg?.id) {
        const { error } = await (supabase as any).from("allocation_config").update(payload).eq("id", data.cfg.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from("allocation_config").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["alocacao"] }); toast.success("Alocação salva!"); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-6xl mx-auto">
      <PageHeader
        title="Alocação do lucro"
        subtitle={`Onde seu dinheiro estará — ${label}`}
        actions={<DateRangeFilter value={range} onChange={setRange} />}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mb-6">
        <StatCard label="Lucro real" value={brl(data?.realProfit ?? 0)} hint="Receita − CMV − comissões" />
        <StatCard label="(−) Gastos do mês" value={brl(data?.expensesTotal ?? 0)} icon={Receipt} hint="Marketing, sacola, chip…" />
        <StatCard accent label="Lucro líquido a alocar" value={brl(data?.netProfit ?? 0)} icon={TrendingUp} hint="Base da distribuição" />
        <StatCard label="% configurada" value={`${sum}%`} hint={sum === 100 ? "OK" : "Deve somar 100%"} />
      </div>

      <Card className="p-5 shadow-card mb-6">
        <div className="flex items-center gap-2 mb-4">
          <PiggyBank className="h-4 w-4 text-primary" />
          <h3 className="font-semibold">Distribuição automática</h3>
          <span className="text-xs text-muted-foreground ml-2">Configure as porcentagens — aplica-se a cada mês</span>
        </div>

        <div className="grid md:grid-cols-3 gap-4 mb-4">
          <Slot title="Investimento" hint="Reservar e reinvestir no negócio" pct={pct.investment} value={alloc.investment} onChange={(v) => setPct({ ...pct, investment: v })} icon={TrendingUp} />
          <Slot title="Pró-labore" hint="Retirada dos sócios" pct={pct.prolabore} value={alloc.prolabore} onChange={(v) => setPct({ ...pct, prolabore: v })} icon={Wallet} />
          <Slot title="Reserva de gastos" hint="Caixa para despesas futuras" pct={pct.expenses} value={alloc.expenses} onChange={(v) => setPct({ ...pct, expenses: v })} icon={Receipt} />
        </div>

        <div className="flex h-3 w-full rounded-full overflow-hidden bg-muted mb-4">
          <div className="bg-primary" style={{ width: `${(pct.investment / Math.max(sum, 1)) * 100}%` }} />
          <div className="bg-accent" style={{ width: `${(pct.prolabore / Math.max(sum, 1)) * 100}%` }} />
          <div className="bg-warning" style={{ width: `${(pct.expenses / Math.max(sum, 1)) * 100}%` }} />
        </div>

        <div className="flex justify-end">
          <Button onClick={() => save.mutate()} disabled={save.isPending || sum !== 100} className="bg-gradient-brand text-primary-foreground border-0">
            <Save className="h-4 w-4 mr-1" /> Salvar alocação
          </Button>
        </div>
      </Card>

      {(data?.netProfit ?? 0) <= 0 && (
        <Card className="p-4 shadow-card border-warning/40 bg-warning/5 text-sm text-muted-foreground">
          O mês ainda não tem lucro líquido positivo — a distribuição ficará zerada até cobrir CMV, comissões e gastos.
        </Card>
      )}
    </div>
  );
}

function Slot({ title, hint, pct, value, onChange, icon: Icon }: { title: string; hint: string; pct: number; value: number; onChange: (v: number) => void; icon: any }) {
  return (
    <div className="rounded-lg border border-border p-4 bg-muted/30">
      <div className="flex items-center gap-2 mb-2">
        <Icon className="h-4 w-4 text-primary" />
        <span className="font-medium text-sm">{title}</span>
      </div>
      <div className="text-2xl font-bold tabular-nums">{brl(value)}</div>
      <div className="text-xs text-muted-foreground mb-3">{hint}</div>
      <div className="flex items-center gap-2">
        <Label className="text-xs">%</Label>
        <Input type="number" min={0} max={100} value={pct} onChange={(e) => onChange(Number(e.target.value || 0))} className="h-8" />
      </div>
    </div>
  );
}
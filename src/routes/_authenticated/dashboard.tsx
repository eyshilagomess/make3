import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { brl, dateTimeBR, channelLabel, orderStatusLabel, paymentMethodLabel } from "@/lib/format";
import { DollarSign, ShoppingBag, AlertTriangle, TrendingUp, Download, Wallet, Banknote, Percent, FileBarChart2, Receipt } from "lucide-react";
import { downloadXLSX } from "@/lib/export";
import { walletFor, WALLETS, channelFeeAmount, infinityPayFeeAmount, type Wallet as WalletType } from "@/lib/wallet";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Make 3" }] }),
  component: Dashboard,
});

function Dashboard() {
  const now = new Date();
  const [month, setMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  const { start, end, label } = useMemo(() => {
    const [y, m] = month.split("-").map(Number);
    const s = new Date(y, m - 1, 1);
    const e = new Date(y, m, 1);
    return {
      start: s.toISOString(),
      end: e.toISOString(),
      label: s.toLocaleDateString("pt-BR", { month: "long", year: "numeric" }),
    };
  }, [month]);

  const { data } = useQuery({
    queryKey: ["dashboard", month],
    queryFn: async () => {
      const startDate = new Date(start).toISOString().slice(0, 10);
      const endDate = new Date(end).toISOString().slice(0, 10);
      const [ordersMonth, recent, lowStock, products, itemsMonth, expensesMonth] = await Promise.all([
        supabase.from("orders").select("id,subtotal,discount,total,shipping,channel,payment_method,payment_method_2,payment_amount_1,payment_amount_2,status,created_at").gte("created_at", start).lt("created_at", end),
        supabase.from("orders").select("id,order_code,total,status,channel,created_at,customers(name)").gte("created_at", start).lt("created_at", end).order("created_at", { ascending: false }).limit(10),
        supabase.from("products").select("id,name,stock,min_stock").eq("status", "ativo"),
        supabase.from("products").select("id", { count: "exact", head: true }),
        supabase.from("order_items").select("order_id,quantity,unit_cost,orders!inner(created_at)").gte("orders.created_at", start).lt("orders.created_at", end),
        (supabase as any).from("expenses").select("amount,category").gte("expense_date", startDate).lt("expense_date", endDate),
      ]);

      const monthTotal = (ordersMonth.data ?? []).reduce((s, o: any) => s + Number(o.total ?? 0), 0);
      const grossRevenue = (ordersMonth.data ?? []).reduce((s, o: any) => s + Number(o.subtotal ?? 0), 0);
      const totalDiscount = (ordersMonth.data ?? []).reduce((s, o: any) => s + Number(o.discount ?? 0), 0);
      const low = (lowStock.data ?? []).filter((p: any) => p.stock <= p.min_stock);
      const byChannel: Record<string, { count: number; total: number }> = {};
      const byPayment: Record<string, { count: number; total: number }> = {};
      const byWallet: Record<WalletType, number> = { "Papel": 0, "Mercado Pago": 0, "Infinity Pay": 0, "Outros": 0 };
      let totalFees = 0;
      let totalChannelFees = 0;
      let totalMachineFees = 0;
      let totalShipping = 0;
      for (const o of ordersMonth.data ?? []) {
        const c = (o as any).channel ?? "outros";
        const p = (o as any).payment_method ?? "outros";
        const tot = Number((o as any).total ?? 0);
        byChannel[c] = byChannel[c] || { count: 0, total: 0 };
        byChannel[c].count++; byChannel[c].total += tot;
        byPayment[p] = byPayment[p] || { count: 0, total: 0 };
        byPayment[p].count++; byPayment[p].total += tot;
        if ((o as any).payment_method_2 && (o as any).payment_amount_1 != null) {
          const a1 = Number((o as any).payment_amount_1 ?? 0);
          const a2 = Number((o as any).payment_amount_2 ?? 0);
          byWallet[walletFor(c, p)] += a1;
          byWallet[walletFor(c, (o as any).payment_method_2)] += a2;
          totalMachineFees += infinityPayFeeAmount(c, p, a1) + infinityPayFeeAmount(c, (o as any).payment_method_2, a2);
        } else {
          byWallet[walletFor(c, p)] += tot;
          totalMachineFees += infinityPayFeeAmount(c, p, tot);
        }
        totalChannelFees += channelFeeAmount(c, tot);
        totalShipping += Number((o as any).shipping ?? 0);
      }
      totalFees = totalChannelFees + totalMachineFees;
      const totalCogs = (itemsMonth.data ?? []).reduce((s: number, i: any) => s + Number(i.unit_cost ?? 0) * Number(i.quantity ?? 0), 0);
      const totalExpenses = (expensesMonth.data ?? []).reduce((s: number, e: any) => s + Number(e.amount ?? 0), 0);
      const grossProfit = monthTotal - totalCogs;
      const profitAfterFees = grossProfit - totalFees;
      const realProfit = profitAfterFees - totalExpenses;
      const cogsPct = monthTotal > 0 ? (totalCogs / monthTotal) * 100 : 0;
      const feesPct = monthTotal > 0 ? (totalFees / monthTotal) * 100 : 0;
      const grossMarginPct = monthTotal > 0 ? (grossProfit / monthTotal) * 100 : 0;
      const realMarginPct = monthTotal > 0 ? (realProfit / monthTotal) * 100 : 0;
      const avgTicket = (ordersMonth.data?.length ?? 0) > 0 ? monthTotal / (ordersMonth.data!.length) : 0;
      return {
        monthTotal, ordersMonth: ordersMonth.data?.length ?? 0, avgTicket,
        productsCount: products.count ?? 0, lowStock: low, recent: recent.data ?? [],
        byChannel, byPayment, byWallet, totalFees, totalChannelFees, totalMachineFees, totalCogs, totalShipping, realProfit, totalExpenses, profitAfterFees,
        grossRevenue, totalDiscount, grossProfit, cogsPct, feesPct, grossMarginPct, realMarginPct,
      };
    },
  });

  const exportDashboard = () => {
    const resumo = [
      { Métrica: "Mês", Valor: label },
      { Métrica: "Receita bruta (produtos)", Valor: data?.grossRevenue ?? 0 },
      { Métrica: "(−) Descontos concedidos", Valor: data?.totalDiscount ?? 0 },
      { Métrica: "(+) Frete cobrado", Valor: data?.totalShipping ?? 0 },
      { Métrica: "(=) Receita líquida", Valor: data?.monthTotal ?? 0 },
      { Métrica: "(−) CMV", Valor: data?.totalCogs ?? 0 },
      { Métrica: "CMV %", Valor: `${(data?.cogsPct ?? 0).toFixed(1)}%` },
      { Métrica: "(=) Lucro bruto", Valor: data?.grossProfit ?? 0 },
      { Métrica: "Margem bruta %", Valor: `${(data?.grossMarginPct ?? 0).toFixed(1)}%` },
      { Métrica: "(−) Comissões plataformas", Valor: data?.totalFees ?? 0 },
      { Métrica: "    ↳ Comissão de canal (Site/Shopee/TikTok)", Valor: data?.totalChannelFees ?? 0 },
      { Métrica: "    ↳ Maquininha Infinity Pay", Valor: data?.totalMachineFees ?? 0 },
      { Métrica: "(=) Lucro operacional", Valor: data?.profitAfterFees ?? 0 },
      { Métrica: "(−) Gastos do mês", Valor: data?.totalExpenses ?? 0 },
      { Métrica: "(=) Lucro real", Valor: data?.realProfit ?? 0 },
      { Métrica: "Margem líquida %", Valor: `${(data?.realMarginPct ?? 0).toFixed(1)}%` },
      { Métrica: "Pedidos", Valor: data?.ordersMonth ?? 0 },
      { Métrica: "Ticket médio", Valor: data?.avgTicket ?? 0 },
      { Métrica: "Produtos ativos", Valor: data?.productsCount ?? 0 },
      { Métrica: "Itens com estoque baixo", Valor: data?.lowStock?.length ?? 0 },
    ];
    const porCarteira = Object.entries(data?.byWallet ?? {}).map(([k, v]) => ({ Carteira: k, Total: v }));
    const porCanal = Object.entries(data?.byChannel ?? {}).map(([k, v]) => ({ Canal: channelLabel(k), Pedidos: v.count, Total: v.total }));
    const porPagamento = Object.entries(data?.byPayment ?? {}).map(([k, v]) => ({ Pagamento: paymentMethodLabel(k), Pedidos: v.count, Total: v.total }));
    const estoqueBaixo = (data?.lowStock ?? []).map((p: any) => ({ Produto: p.name, Estoque: p.stock, Mínimo: p.min_stock }));
    downloadXLSX(`dashboard-${month}.xlsx`, { Resumo: resumo, "Onde está o dinheiro": porCarteira, "Por canal": porCanal, "Por pagamento": porPagamento, "Estoque baixo": estoqueBaixo });
  };

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-7xl mx-auto">
      <PageHeader
        title="Dashboard"
        subtitle={`Resumo mensal — ${label}`}
        actions={
          <div className="flex items-center gap-2">
            <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-[170px]" />
            <Button variant="outline" onClick={exportDashboard}><Download className="h-4 w-4 mr-1" /> Baixar</Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-3 sm:gap-4 mb-6">
        <StatCard accent label="Faturamento" value={brl(data?.monthTotal ?? 0)} icon={DollarSign} hint={`${data?.ordersMonth ?? 0} pedidos`} />
        <StatCard label="CMV %" value={`${(data?.cogsPct ?? 0).toFixed(1)}%`} icon={Percent} hint={brl(data?.totalCogs ?? 0)} />
        <StatCard label="Gastos do mês" value={brl(data?.totalExpenses ?? 0)} icon={Receipt} hint="Marketing, sacola…" />
        <StatCard label="Lucro real" value={brl(data?.realProfit ?? 0)} icon={TrendingUp} hint={`− CMV − taxas ${brl(data?.totalFees ?? 0)}`} />
        <StatCard label="Margem líquida" value={`${(data?.realMarginPct ?? 0).toFixed(1)}%`} icon={Percent} hint={`Bruta ${(data?.grossMarginPct ?? 0).toFixed(1)}%`} />
        <StatCard label="Ticket médio" value={brl(data?.avgTicket ?? 0)} icon={Banknote} />
        <StatCard label="Estoque baixo" value={data?.lowStock?.length ?? 0} icon={AlertTriangle} hint="Abaixo do mínimo" />
      </div>

      <Card className="p-5 shadow-card mb-6">
        <div className="flex items-center gap-2 mb-4">
          <FileBarChart2 className="h-4 w-4 text-primary" />
          <h3 className="font-semibold">DRE do mês</h3>
          <span className="text-xs text-muted-foreground ml-2">Demonstração do resultado</span>
        </div>
        <div className="divide-y divide-border text-sm">
          {[
            { label: "Receita bruta (produtos)", value: data?.grossRevenue ?? 0, sign: "+" },
            { label: "Descontos concedidos", value: -(data?.totalDiscount ?? 0), sign: "−" },
            { label: "Frete cobrado", value: data?.totalShipping ?? 0, sign: "+" },
            { label: "Receita líquida", value: data?.monthTotal ?? 0, total: true },
            { label: `CMV (${(data?.cogsPct ?? 0).toFixed(1)}%)`, value: -(data?.totalCogs ?? 0), sign: "−" },
            { label: `Lucro bruto (${(data?.grossMarginPct ?? 0).toFixed(1)}%)`, value: data?.grossProfit ?? 0, total: true },
            { label: "Comissões plataformas", value: -(data?.totalFees ?? 0), sign: "−" },
            { label: "  ↳ Canal (Site 4% · Shopee 22% · TikTok 12%)", value: -(data?.totalChannelFees ?? 0), sub: true },
            { label: "  ↳ Maquininha Infinity Pay (Déb 1,49% · Créd 4,29%)", value: -(data?.totalMachineFees ?? 0), sub: true },
            { label: "Lucro operacional", value: data?.profitAfterFees ?? 0, total: true },
            { label: "Gastos do mês (marketing, sacola, chip…)", value: -(data?.totalExpenses ?? 0), sign: "−" },
            { label: `Lucro real (${(data?.realMarginPct ?? 0).toFixed(1)}%)`, value: data?.realProfit ?? 0, total: true, highlight: true },
          ].map((row, i) => (
            <div key={i} className={`flex items-center justify-between py-2 ${row.total ? "font-semibold" : ""} ${row.highlight ? "text-primary" : ""} ${(row as any).sub ? "text-xs text-muted-foreground pl-4" : ""}`}>
              <span className="flex items-center gap-2">
                {row.sign && <span className="text-muted-foreground w-3 inline-block text-center">{row.sign}</span>}
                {!row.sign && <span className="w-3" />}
                {row.label}
              </span>
              <span className={row.total ? "tabular-nums" : "tabular-nums text-muted-foreground"}>{brl(Math.abs(row.value))}</span>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground mt-3">
          CMV usa o custo do produto no momento da venda. Comissões de canal: Site 4% · Shopee 22% · TikTok 12%. Maquininha Infinity Pay (presencial): Pix 0% · Débito 1,49% · Crédito 4,29%. Não inclui frete pago à transportadora, impostos e devoluções.
        </p>
      </Card>

      <Card className="p-5 shadow-card mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Wallet className="h-4 w-4 text-primary" />
          <h3 className="font-semibold">Onde está o dinheiro</h3>
          <span className="text-xs text-muted-foreground ml-2">Recebimentos do mês por carteira</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {WALLETS.map((w) => {
            const val = data?.byWallet?.[w] ?? 0;
            const hint = w === "Papel" ? "Dinheiro físico"
              : w === "Mercado Pago" ? "Site · Shopee · TikTok"
              : w === "Infinity Pay" ? "Pix/Cartão presencial"
              : "Demais recebimentos";
            return (
              <div key={w} className="rounded-lg border border-border bg-muted/30 p-4">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">{w}</div>
                <div className="text-2xl font-bold mt-1">{brl(val)}</div>
                <div className="text-[11px] text-muted-foreground mt-1">{hint}</div>
              </div>
            );
          })}
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 p-5 shadow-card">
          <div className="flex items-center gap-2 mb-4">
            <ShoppingBag className="h-4 w-4 text-primary" />
            <h3 className="font-semibold">Pedidos do mês</h3>
          </div>
          <div className="space-y-2">
            {data?.recent?.length === 0 && <p className="text-sm text-muted-foreground py-8 text-center">Nenhum pedido neste mês.</p>}
            {data?.recent?.map((o: any) => (
              <div key={o.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/40 hover:bg-muted/70 transition">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground">{o.order_code}</span>
                    <Badge variant="outline" className="text-[10px]">{channelLabel(o.channel)}</Badge>
                  </div>
                  <div className="text-sm truncate">{o.customers?.name ?? "Cliente avulso"}</div>
                  <div className="text-xs text-muted-foreground">{dateTimeBR(o.created_at)}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-semibold">{brl(o.total)}</div>
                  <Badge variant="secondary" className="text-[10px] mt-1">{orderStatusLabel(o.status)}</Badge>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-5 shadow-card">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="h-4 w-4 text-warning" />
            <h3 className="font-semibold">Estoque baixo</h3>
          </div>
          <div className="space-y-2">
            {(data?.lowStock ?? []).length === 0 && <p className="text-sm text-muted-foreground py-8 text-center">Tudo no nível esperado.</p>}
            {data?.lowStock?.slice(0, 8).map((p: any) => (
              <div key={p.id} className="flex items-center justify-between p-2 rounded-md bg-muted/40">
                <span className="text-sm truncate">{p.name}</span>
                <span className="text-xs font-mono text-warning">{p.stock}/{p.min_stock}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
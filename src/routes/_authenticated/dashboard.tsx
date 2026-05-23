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
import { brl, dateTimeBR, channelLabel, orderStatusLabel } from "@/lib/format";
import { DollarSign, ShoppingBag, Package, AlertTriangle, TrendingUp, Download } from "lucide-react";
import { downloadXLSX } from "@/lib/export";

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
      const [ordersMonth, recent, lowStock, products] = await Promise.all([
        supabase.from("orders").select("total,channel,payment_method,status,created_at").gte("created_at", start).lt("created_at", end),
        supabase.from("orders").select("id,order_code,total,status,channel,created_at,customers(name)").gte("created_at", start).lt("created_at", end).order("created_at", { ascending: false }).limit(10),
        supabase.from("products").select("id,name,stock,min_stock").eq("status","ativo"),
        supabase.from("products").select("id", { count: "exact", head: true }),
      ]);

      const monthTotal = (ordersMonth.data ?? []).reduce((s, o: any) => s + Number(o.total ?? 0), 0);
      const low = (lowStock.data ?? []).filter((p: any) => p.stock <= p.min_stock);
      const byChannel: Record<string, { count: number; total: number }> = {};
      const byPayment: Record<string, { count: number; total: number }> = {};
      for (const o of ordersMonth.data ?? []) {
        const c = (o as any).channel ?? "outros";
        const p = (o as any).payment_method ?? "outros";
        byChannel[c] = byChannel[c] || { count: 0, total: 0 };
        byChannel[c].count++; byChannel[c].total += Number((o as any).total ?? 0);
        byPayment[p] = byPayment[p] || { count: 0, total: 0 };
        byPayment[p].count++; byPayment[p].total += Number((o as any).total ?? 0);
      }
      const avgTicket = (ordersMonth.data?.length ?? 0) > 0 ? monthTotal / (ordersMonth.data!.length) : 0;
      return {
        monthTotal,
        ordersMonth: ordersMonth.data?.length ?? 0,
        avgTicket,
        productsCount: products.count ?? 0,
        lowStock: low,
        recent: recent.data ?? [],
        byChannel,
        byPayment,
      };
    },
  });

  const exportDashboard = () => {
    const resumo = [
      { Métrica: "Mês", Valor: label },
      { Métrica: "Faturamento", Valor: data?.monthTotal ?? 0 },
      { Métrica: "Pedidos", Valor: data?.ordersMonth ?? 0 },
      { Métrica: "Ticket médio", Valor: data?.avgTicket ?? 0 },
      { Métrica: "Produtos ativos", Valor: data?.productsCount ?? 0 },
      { Métrica: "Itens com estoque baixo", Valor: data?.lowStock?.length ?? 0 },
    ];
    const porCanal = Object.entries(data?.byChannel ?? {}).map(([k, v]) => ({ Canal: channelLabel(k), Pedidos: v.count, Total: v.total }));
    const porPagamento = Object.entries(data?.byPayment ?? {}).map(([k, v]) => ({ Pagamento: k, Pedidos: v.count, Total: v.total }));
    const estoqueBaixo = (data?.lowStock ?? []).map((p: any) => ({ Produto: p.name, Estoque: p.stock, Mínimo: p.min_stock }));
    downloadXLSX(`dashboard-${month}.xlsx`, { Resumo: resumo, "Por canal": porCanal, "Por pagamento": porPagamento, "Estoque baixo": estoqueBaixo });
  };

  return (
    <div className="p-8 max-w-7xl mx-auto">
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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard accent label="Faturamento do mês" value={brl(data?.monthTotal ?? 0)} icon={DollarSign} hint={`${data?.ordersMonth ?? 0} pedidos`} />
        <StatCard label="Ticket médio" value={brl(data?.avgTicket ?? 0)} icon={TrendingUp} />
        <StatCard label="Produtos ativos" value={data?.productsCount ?? 0} icon={Package} />
        <StatCard label="Estoque baixo" value={data?.lowStock?.length ?? 0} icon={AlertTriangle} hint="Produtos abaixo do mínimo" />
      </div>

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
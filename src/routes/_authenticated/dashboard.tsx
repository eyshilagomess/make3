import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { brl, dateTimeBR, channelLabel, orderStatusLabel } from "@/lib/format";
import { DollarSign, ShoppingBag, Package, AlertTriangle, TrendingUp } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Make 3" }] }),
  component: Dashboard,
});

function Dashboard() {
  const { data } = useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const startOfDay = new Date(); startOfDay.setHours(0,0,0,0);
      const startOfMonth = new Date(); startOfMonth.setDate(1); startOfMonth.setHours(0,0,0,0);

      const [ordersDay, ordersMonth, recent, lowStock, products] = await Promise.all([
        supabase.from("orders").select("total,channel,payment_method").gte("created_at", startOfDay.toISOString()),
        supabase.from("orders").select("total").gte("created_at", startOfMonth.toISOString()),
        supabase.from("orders").select("id,order_code,total,status,channel,created_at,customers(name)").order("created_at", { ascending: false }).limit(8),
        supabase.from("products").select("id,name,stock,min_stock").eq("status","ativo"),
        supabase.from("products").select("id", { count: "exact", head: true }),
      ]);

      const dayTotal = (ordersDay.data ?? []).reduce((s, o: any) => s + Number(o.total ?? 0), 0);
      const monthTotal = (ordersMonth.data ?? []).reduce((s, o: any) => s + Number(o.total ?? 0), 0);
      const low = (lowStock.data ?? []).filter((p: any) => p.stock <= p.min_stock);
      return {
        dayTotal,
        monthTotal,
        ordersToday: ordersDay.data?.length ?? 0,
        ordersMonth: ordersMonth.data?.length ?? 0,
        productsCount: products.count ?? 0,
        lowStock: low,
        recent: recent.data ?? [],
      };
    },
  });

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <PageHeader title="Dashboard" subtitle="Visão geral da operação Make 3" />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard accent label="Vendas hoje" value={brl(data?.dayTotal ?? 0)} icon={DollarSign} hint={`${data?.ordersToday ?? 0} pedidos`} />
        <StatCard label="Vendas no mês" value={brl(data?.monthTotal ?? 0)} icon={TrendingUp} hint={`${data?.ordersMonth ?? 0} pedidos`} />
        <StatCard label="Produtos ativos" value={data?.productsCount ?? 0} icon={Package} />
        <StatCard label="Estoque baixo" value={data?.lowStock?.length ?? 0} icon={AlertTriangle} hint="Produtos abaixo do mínimo" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 p-5 shadow-card">
          <div className="flex items-center gap-2 mb-4">
            <ShoppingBag className="h-4 w-4 text-primary" />
            <h3 className="font-semibold">Últimos pedidos</h3>
          </div>
          <div className="space-y-2">
            {data?.recent?.length === 0 && <p className="text-sm text-muted-foreground py-8 text-center">Nenhum pedido ainda.</p>}
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
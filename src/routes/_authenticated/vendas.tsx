import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { brl, channelLabel, paymentMethodLabel, orderStatusLabel } from "@/lib/format";
import { downloadXLSX } from "@/lib/export";
import { Download } from "lucide-react";

export const Route = createFileRoute("/_authenticated/vendas")({
  head: () => ({ meta: [{ title: "Vendas — Make 3" }] }),
  component: Page,
});

function Page() {
  const now = new Date();
  const [month, setMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  const { start, end, label } = useMemo(() => {
    const [y, m] = month.split("-").map(Number);
    const s = new Date(y, m - 1, 1);
    const e = new Date(y, m, 1);
    return { start: s.toISOString(), end: e.toISOString(), label: s.toLocaleDateString("pt-BR", { month: "long", year: "numeric" }) };
  }, [month]);

  const { data: orders } = useQuery({
    queryKey: ["vendas", month],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id,order_code,total,channel,payment_method,payment_status,status,created_at")
        .gte("created_at", start).lt("created_at", end)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const groups = useMemo(() => {
    const byChannel: Record<string, { count: number; total: number }> = {};
    const byPayment: Record<string, { count: number; total: number }> = {};
    const byStatus: Record<string, { count: number; total: number }> = {};
    let total = 0;
    for (const o of orders ?? []) {
      const t = Number(o.total ?? 0); total += t;
      const c = o.channel ?? "outros"; const p = o.payment_method ?? "outros"; const s = o.status ?? "pendente";
      byChannel[c] = byChannel[c] || { count: 0, total: 0 }; byChannel[c].count++; byChannel[c].total += t;
      byPayment[p] = byPayment[p] || { count: 0, total: 0 }; byPayment[p].count++; byPayment[p].total += t;
      byStatus[s] = byStatus[s] || { count: 0, total: 0 }; byStatus[s].count++; byStatus[s].total += t;
    }
    return { byChannel, byPayment, byStatus, total, count: orders?.length ?? 0 };
  }, [orders]);

  const exportar = () => {
    downloadXLSX(`vendas-${month}.xlsx`, {
      "Por canal": Object.entries(groups.byChannel).map(([k, v]) => ({ Canal: channelLabel(k), Pedidos: v.count, Total: v.total, "% Receita": groups.total ? (v.total / groups.total) * 100 : 0 })),
      "Por pagamento": Object.entries(groups.byPayment).map(([k, v]) => ({ Pagamento: paymentMethodLabel(k), Pedidos: v.count, Total: v.total })),
      "Por status": Object.entries(groups.byStatus).map(([k, v]) => ({ Status: orderStatusLabel(k), Pedidos: v.count, Total: v.total })),
    });
  };

  const renderTable = (rows: [string, { count: number; total: number }][], labelFn: (k: string) => string) => (
    <Table>
      <TableHeader><TableRow><TableHead>Categoria</TableHead><TableHead className="text-right">Pedidos</TableHead><TableHead className="text-right">Total</TableHead><TableHead className="text-right">%</TableHead></TableRow></TableHeader>
      <TableBody>
        {rows.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">Sem vendas no período.</TableCell></TableRow>}
        {rows.sort((a, b) => b[1].total - a[1].total).map(([k, v]) => (
          <TableRow key={k}>
            <TableCell className="font-medium">{labelFn(k)}</TableCell>
            <TableCell className="text-right">{v.count}</TableCell>
            <TableCell className="text-right font-semibold">{brl(v.total)}</TableCell>
            <TableCell className="text-right text-muted-foreground">{groups.total ? ((v.total / groups.total) * 100).toFixed(1) : "0.0"}%</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-7xl mx-auto">
      <PageHeader
        title="Vendas"
        subtitle={`Análise por canal — ${label}`}
        actions={
          <div className="flex items-center gap-2">
            <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-[170px]" />
            <Button variant="outline" onClick={exportar}><Download className="h-4 w-4 mr-1" /> Baixar</Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <Card className="p-5 shadow-card"><div className="text-xs text-muted-foreground uppercase">Faturamento</div><div className="text-2xl font-bold">{brl(groups.total)}</div></Card>
        <Card className="p-5 shadow-card"><div className="text-xs text-muted-foreground uppercase">Pedidos</div><div className="text-2xl font-bold">{groups.count}</div></Card>
        <Card className="p-5 shadow-card"><div className="text-xs text-muted-foreground uppercase">Ticket médio</div><div className="text-2xl font-bold">{brl(groups.count ? groups.total / groups.count : 0)}</div></Card>
      </div>

      <Card className="p-4 shadow-card">
        <Tabs defaultValue="canal">
          <TabsList>
            <TabsTrigger value="canal">Por canal</TabsTrigger>
            <TabsTrigger value="pagamento">Por pagamento</TabsTrigger>
            <TabsTrigger value="status">Por status</TabsTrigger>
          </TabsList>
          <TabsContent value="canal">{renderTable(Object.entries(groups.byChannel), channelLabel)}</TabsContent>
          <TabsContent value="pagamento">{renderTable(Object.entries(groups.byPayment), paymentMethodLabel)}</TabsContent>
          <TabsContent value="status">{renderTable(Object.entries(groups.byStatus), orderStatusLabel)}</TabsContent>
        </Tabs>
      </Card>
    </div>
  );
}
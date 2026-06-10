import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { brl, dateTimeBR, channelLabel, orderStatusLabel, paymentMethodLabel } from "@/lib/format";
import { DollarSign, ShoppingBag, AlertTriangle, TrendingUp, Download, Wallet, Banknote, Percent, FileBarChart2, Receipt, BarChart3, Boxes, Tag, ChevronRight } from "lucide-react";
import { downloadXLSX } from "@/lib/export";
import { walletFor, WALLETS, channelFeeAmount, infinityPayFeeAmount, type Wallet as WalletType } from "@/lib/wallet";
import { canonicalExpenseCategory, groupExpensesByCategory, fmtPct, pct } from "@/lib/finance";
import { MetricDrillDown, type DrillColumn } from "@/components/MetricDrillDown";
import { DateRangeFilter } from "@/components/DateRangeFilter";
import { rangeFromPreset, DEFAULT_PRESET, toISO, endExclusiveISO, toDateStr, type DateRange } from "@/lib/date-range";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Make 3" }] }),
  component: Dashboard,
});

function Dashboard() {
  const [range, setRange] = useState<DateRange>(() => rangeFromPreset(DEFAULT_PRESET));
  const [drill, setDrill] = useState<null | {
    label: string; value: string; formula: string; sources: string[]; description?: string;
    rows?: any[]; columns?: DrillColumn<any>[]; breakdown?: { label: string; value: string; hint?: string }[];
    emptyMessage?: string;
  }>(null);
  const start = toISO(range.start);
  const end = endExclusiveISO(range.end);
  const label = range.label;

  const { data } = useQuery({
    queryKey: ["dashboard", start, end],
    queryFn: async () => {
      const startDate = toDateStr(range.start);
      const endDate = toDateStr(new Date(range.end.getTime() + 1));
      const [ordersMonth, recent, lowStock, products, itemsMonth, expensesMonth] = await Promise.all([
        supabase.from("orders").select("id,order_code,subtotal,discount,total,shipping,channel,payment_method,payment_method_2,payment_amount_1,payment_amount_2,status,created_at,customers(name)").gte("created_at", start).lt("created_at", end),
        supabase.from("orders").select("id,order_code,total,status,channel,created_at,customers(name)").gte("created_at", start).lt("created_at", end).order("created_at", { ascending: false }).limit(10),
        supabase.from("products").select("id,name,stock,min_stock,category,cost,price").eq("status", "ativo"),
        supabase.from("products").select("id", { count: "exact", head: true }),
        supabase.from("order_items").select("order_id,product_id,product_name,quantity,unit_price,unit_cost,subtotal,orders!inner(id,order_code,channel,created_at)").gte("orders.created_at", start).lt("orders.created_at", end),
        (supabase as any).from("expenses").select("amount,category").gte("expense_date", startDate).lt("expense_date", endDate),
      ]);

      // Fonte da verdade: pedidos NÃO cancelados. Pedidos cancelados não entram em nenhum cálculo financeiro.
      const allOrders = (ordersMonth.data ?? []) as any[];
      const cancelledOrders = allOrders.filter((o) => o.status === "cancelado");
      const validOrders = allOrders.filter((o) => o.status !== "cancelado");
      const validOrderIds = new Set(validOrders.map((o) => o.id));
      const validItems = ((itemsMonth.data ?? []) as any[]).filter((i) => validOrderIds.has(i.order_id));

      const grossRevenue = validOrders.reduce((s, o) => s + Number(o.subtotal ?? 0), 0);
      const totalDiscount = validOrders.reduce((s, o) => s + Number(o.discount ?? 0), 0);
      const netProductRevenue = grossRevenue - totalDiscount; // Receita líquida de produtos (DRE)
      const monthTotal = validOrders.reduce((s, o) => s + Number(o.total ?? 0), 0); // Faturamento total (com frete)
      const low = (lowStock.data ?? []).filter((p: any) => p.stock <= p.min_stock);
      const byChannel: Record<string, { count: number; total: number }> = {};
      const byPayment: Record<string, { count: number; total: number }> = {};
      const byWallet: Record<WalletType, number> = { "Papel": 0, "Mercado Pago": 0, "Infinity Pay": 0, "Outros": 0 };
      const byWalletFees: Record<WalletType, number> = { "Papel": 0, "Mercado Pago": 0, "Infinity Pay": 0, "Outros": 0 };
      let totalFees = 0;
      let totalChannelFees = 0;
      let totalMachineFees = 0;
      let totalShipping = 0;
      for (const o of validOrders) {
        const c = (o as any).channel ?? "outros";
        const p = (o as any).payment_method ?? "outros";
        const tot = Number((o as any).total ?? 0);
        byChannel[c] = byChannel[c] || { count: 0, total: 0 };
        byChannel[c].count++; byChannel[c].total += tot;
        byPayment[p] = byPayment[p] || { count: 0, total: 0 };
        byPayment[p].count++; byPayment[p].total += tot;
        const chFee = channelFeeAmount(c, tot);
        if ((o as any).payment_method_2 && (o as any).payment_amount_1 != null) {
          const a1 = Number((o as any).payment_amount_1 ?? 0);
          const a2 = Number((o as any).payment_amount_2 ?? 0);
          const w1 = walletFor(c, p);
          const w2 = walletFor(c, (o as any).payment_method_2);
          byWallet[w1] += a1;
          byWallet[w2] += a2;
          const m1 = infinityPayFeeAmount(c, p, a1);
          const m2 = infinityPayFeeAmount(c, (o as any).payment_method_2, a2);
          byWalletFees[w1] += m1 + (tot > 0 ? (chFee * a1) / tot : 0);
          byWalletFees[w2] += m2 + (tot > 0 ? (chFee * a2) / tot : 0);
          totalMachineFees += m1 + m2;
        } else {
          const w = walletFor(c, p);
          byWallet[w] += tot;
          const mf = infinityPayFeeAmount(c, p, tot);
          byWalletFees[w] += mf + chFee;
          totalMachineFees += mf;
        }
        totalChannelFees += chFee;
        totalShipping += Number((o as any).shipping ?? 0);
      }
      totalFees = totalChannelFees + totalMachineFees;
      const totalCogs = validItems.reduce((s, i) => s + Number(i.unit_cost ?? 0) * Number(i.quantity ?? 0), 0);
      const totalExpenses = (expensesMonth.data ?? []).reduce((s: number, e: any) => s + Number(e.amount ?? 0), 0);
      const expensesByCat = groupExpensesByCategory((expensesMonth.data ?? []) as any[]);
      // DRE corrigida: lucro bruto = receita líquida de PRODUTOS − CMV (sem frete cobrado).
      const grossProfit = netProductRevenue - totalCogs;
      const profitAfterFees = grossProfit + totalShipping - totalFees; // adiciona frete cobrado e desconta taxas
      const realProfit = profitAfterFees - totalExpenses;
      const cogsPct = netProductRevenue > 0 ? (totalCogs / netProductRevenue) * 100 : 0;
      const feesPct = monthTotal > 0 ? (totalFees / monthTotal) * 100 : 0;
      const grossMarginPct = netProductRevenue > 0 ? (grossProfit / netProductRevenue) * 100 : 0;
      const realMarginPct = monthTotal > 0 ? (realProfit / monthTotal) * 100 : 0;
      const avgTicket = validOrders.length > 0 ? monthTotal / validOrders.length : 0;

      // Indicadores por produto/categoria
      // Busca categoria também de produtos inativos para não agrupar errado em "Sem categoria".
      const itemProductIds = Array.from(new Set(validItems.map((i) => i.product_id).filter(Boolean)));
      let allProductsCat: any[] = [];
      if (itemProductIds.length > 0) {
        const res = await supabase.from("products").select("id,name,stock,min_stock,category,cost,price").in("id", itemProductIds);
        allProductsCat = res.data ?? [];
      }
      const productMap = new Map<string, any>();
      for (const p of (lowStock.data ?? []) as any[]) productMap.set(p.id, p);
      for (const p of allProductsCat) productMap.set(p.id, { ...productMap.get(p.id), ...p });
      const byProduct: Record<string, { id: string; name: string; category: string | null; qty: number; revenue: number; cogs: number; profit: number }> = {};
      const byCategory: Record<string, { qty: number; revenue: number; cogs: number; profit: number }> = {};
      for (const it of validItems) {
        const pid = it.product_id ?? "—";
        const prod = productMap.get(pid);
        const cat = (prod?.category ?? "Sem categoria") as string;
        const revenue = Number(it.subtotal ?? Number(it.unit_price ?? 0) * Number(it.quantity ?? 0));
        const cogs = Number(it.unit_cost ?? 0) * Number(it.quantity ?? 0);
        const profit = revenue - cogs;
        byProduct[pid] = byProduct[pid] || { id: pid, name: it.product_name ?? prod?.name ?? "—", category: cat, qty: 0, revenue: 0, cogs: 0, profit: 0 };
        byProduct[pid].qty += Number(it.quantity ?? 0);
        byProduct[pid].revenue += revenue;
        byProduct[pid].cogs += cogs;
        byProduct[pid].profit += profit;
        byCategory[cat] = byCategory[cat] || { qty: 0, revenue: 0, cogs: 0, profit: 0 };
        byCategory[cat].qty += Number(it.quantity ?? 0);
        byCategory[cat].revenue += revenue;
        byCategory[cat].cogs += cogs;
        byCategory[cat].profit += profit;
      }
      const productsRanked = Object.values(byProduct).sort((a, b) => b.profit - a.profit);
      const categoriesRanked = Object.entries(byCategory).map(([name, v]) => ({ name, ...v })).sort((a, b) => b.profit - a.profit);
      // Margem média (por pedido) — ignora cancelados e pedidos com total=0
      const validForMargin = validOrders.filter((o: any) => Number(o.total ?? 0) > 0);
      const perOrderMargins: number[] = validForMargin.map((o: any) => {
        const itemsOfOrder = validItems.filter((i) => i.order_id === o.id);
        const cogs = itemsOfOrder.reduce((s, i) => s + Number(i.unit_cost ?? 0) * Number(i.quantity ?? 0), 0);
        const fees = channelFeeAmount(o.channel, Number(o.total ?? 0)) + ((o.payment_method_2 && o.payment_amount_1 != null)
          ? infinityPayFeeAmount(o.channel, o.payment_method, Number(o.payment_amount_1 ?? 0)) + infinityPayFeeAmount(o.channel, o.payment_method_2, Number(o.payment_amount_2 ?? 0))
          : infinityPayFeeAmount(o.channel, o.payment_method, Number(o.total ?? 0)));
        const profit = Number(o.total ?? 0) - cogs - fees;
        return (profit / Number(o.total)) * 100;
      });
      const avgMarginPct = perOrderMargins.length > 0 ? perOrderMargins.reduce((a, b) => a + b, 0) / perOrderMargins.length : 0;
      // Giro de estoque (por produto) = qty vendida / max(estoque atual, 1)
      const turnover = Object.values(byProduct).map((p) => {
        const prod = productMap.get(p.id);
        const stock = Number(prod?.stock ?? 0);
        return { ...p, stock, turnover: stock > 0 ? p.qty / stock : p.qty };
      }).sort((a, b) => b.turnover - a.turnover);

      return {
        monthTotal, ordersMonth: validOrders.length, cancelledCount: cancelledOrders.length, avgTicket,
        productsCount: products.count ?? 0, lowStock: low, recent: recent.data ?? [],
        byChannel, byPayment, byWallet, byWalletFees, totalFees, totalChannelFees, totalMachineFees, totalCogs, totalShipping, realProfit, totalExpenses, profitAfterFees,
        grossRevenue, totalDiscount, netProductRevenue, grossProfit, cogsPct, feesPct, grossMarginPct, realMarginPct,
        expensesByCat, ordersList: validOrders, itemsList: validItems, expensesList: expensesMonth.data ?? [],
        productsRanked, categoriesRanked, turnover, avgMarginPct,
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
    downloadXLSX(`dashboard-${toDateStr(range.start)}_${toDateStr(range.end)}.xlsx`, { Resumo: resumo, "Onde está o dinheiro": porCarteira, "Por canal": porCanal, "Por pagamento": porPagamento, "Estoque baixo": estoqueBaixo });
  };

  // ---------- Drill-down columns ----------
  const ordersCols: DrillColumn<any>[] = [
    { key: "code", header: "Pedido", render: (o) => <span className="font-mono text-xs">{o.order_code}</span> },
    { key: "date", header: "Data", render: (o) => <span className="text-xs">{dateTimeBR(o.created_at)}</span> },
    { key: "cust", header: "Cliente", render: (o) => o.customers?.name ?? "Avulso" },
    { key: "ch", header: "Canal", render: (o) => <Badge variant="outline" className="text-[10px]">{channelLabel(o.channel)}</Badge> },
    { key: "tot", header: "Total", className: "text-right tabular-nums", render: (o) => brl(o.total) },
  ];
  const itemsCols: DrillColumn<any>[] = [
    { key: "ord", header: "Pedido", render: (i) => <span className="font-mono text-xs">{i.orders?.order_code ?? i.order_id}</span> },
    { key: "prod", header: "Produto", render: (i) => i.product_name },
    { key: "qty", header: "Qtd", className: "text-right", render: (i) => i.quantity },
    { key: "uc", header: "Custo unit.", className: "text-right tabular-nums", render: (i) => brl(i.unit_cost) },
    { key: "tot", header: "CMV", className: "text-right tabular-nums", render: (i) => brl(Number(i.unit_cost) * Number(i.quantity)) },
  ];
  const expCols: DrillColumn<any>[] = [
    { key: "cat", header: "Categoria", render: (e) => canonicalExpenseCategory(e.category) },
    { key: "raw", header: "Original", render: (e) => <span className="text-xs text-muted-foreground">{e.category}</span> },
    { key: "amt", header: "Valor", className: "text-right tabular-nums", render: (e) => brl(e.amount) },
  ];

  // ---------- Drill openers ----------
  const openRevenue = () => setDrill({
    label: "Faturamento (pedidos não cancelados)", value: brl(data?.monthTotal ?? 0),
    formula: "Σ orders.total WHERE status ≠ 'cancelado'\n= Σ (subtotal − discount + shipping)",
    sources: ["orders.total", "orders.status", "orders.created_at"],
    description: `Soma dos totais dos pedidos válidos no período. ${data?.cancelledCount ? `${data?.cancelledCount} pedido(s) cancelado(s) excluído(s).` : ""}`.trim(),
    rows: data?.ordersList, columns: ordersCols,
    breakdown: [
      { label: "Receita bruta", value: brl(data?.grossRevenue ?? 0), hint: "Σ subtotal" },
      { label: "(−) Descontos", value: brl(data?.totalDiscount ?? 0) },
      { label: "(=) Receita líquida produtos", value: brl(data?.netProductRevenue ?? 0), hint: "base do CMV %" },
      { label: "(+) Frete cobrado", value: brl(data?.totalShipping ?? 0) },
      { label: "(=) Faturamento total", value: brl(data?.monthTotal ?? 0) },
    ],
  });
  const openCogs = () => setDrill({
    label: "CMV (custo das mercadorias vendidas)", value: brl(data?.totalCogs ?? 0),
    formula: "Σ order_items.unit_cost × quantity (pedidos não cancelados)\nCMV % = CMV / Receita líquida de produtos × 100",
    sources: ["order_items.unit_cost", "order_items.quantity", "orders.status"],
    description: "Apenas o custo do produto vendido. Embalagem, brindes e frete subsidiado têm categorias próprias.",
    rows: data?.itemsList, columns: itemsCols,
    breakdown: [
      { label: "CMV %", value: fmtPct(data?.cogsPct ?? 0), hint: "sobre receita líquida de produtos" },
      { label: "Receita líquida produtos", value: brl(data?.netProductRevenue ?? 0) },
    ],
  });
  const openFees = () => setDrill({
    label: "Taxas de pagamento", value: brl(data?.totalFees ?? 0),
    formula: "Σ (canal × total) + Σ (maquininha × valor pago)\nCanal: Site 4% · Shopee 22% · TikTok 12%\nInfinity Pay: Pix 0% · Débito 1,49% · Crédito 4,29%",
    sources: ["orders.channel", "orders.payment_method", "orders.payment_amount_1/2"],
    rows: data?.ordersList, columns: ordersCols,
    breakdown: [
      { label: "Canal", value: brl(data?.totalChannelFees ?? 0), hint: "Site/Shopee/TikTok" },
      { label: "Maquininha", value: brl(data?.totalMachineFees ?? 0), hint: "Infinity Pay presencial" },
    ],
  });
  const openExpenseCat = (cat: string) => {
    const rows = (data?.expensesList ?? []).filter((e: any) => canonicalExpenseCategory(e.category) === cat);
    const total = rows.reduce((s: number, e: any) => s + Number(e.amount ?? 0), 0);
    setDrill({
      label: `Despesa — ${cat}`, value: brl(total),
      formula: `Σ expenses.amount WHERE categoria normalizada = '${cat}'`,
      sources: ["expenses.amount", "expenses.category", "expenses.expense_date"],
      rows, columns: expCols,
    });
  };
  const openExpenses = () => setDrill({
    label: "Gastos do mês", value: brl(data?.totalExpenses ?? 0),
    formula: "Σ expenses.amount (no mês)",
    sources: ["expenses.amount", "expenses.expense_date"],
    rows: data?.expensesList, columns: expCols,
    breakdown: Object.entries(data?.expensesByCat ?? {}).map(([k, v]) => ({ label: k, value: brl(v as number) })),
  });
  const openRealProfit = () => setDrill({
    label: "Lucro líquido (real)", value: brl(data?.realProfit ?? 0),
    formula: "Receita líquida produtos − CMV\n  + Frete cobrado\n  − Taxas canal − Taxas maquininha\n  − Σ Despesas operacionais\nMargem líquida = Lucro líquido / Faturamento × 100",
    sources: ["orders", "order_items", "expenses"],
    breakdown: [
      { label: "Receita líquida produtos", value: brl(data?.netProductRevenue ?? 0) },
      { label: "(−) CMV", value: brl(data?.totalCogs ?? 0) },
      { label: "(=) Lucro bruto", value: brl(data?.grossProfit ?? 0) },
      { label: "(+) Frete cobrado", value: brl(data?.totalShipping ?? 0) },
      { label: "(−) Taxas", value: brl(data?.totalFees ?? 0) },
      { label: "(−) Despesas", value: brl(data?.totalExpenses ?? 0) },
      { label: "Margem líquida", value: fmtPct(data?.realMarginPct ?? 0) },
    ],
  });
  const openGrossProfit = () => setDrill({
    label: "Lucro bruto", value: brl(data?.grossProfit ?? 0),
    formula: "Receita líquida produtos − CMV\nMargem bruta = Lucro bruto / Receita líquida produtos × 100",
    sources: ["orders.subtotal", "orders.discount", "order_items.unit_cost"],
    breakdown: [
      { label: "Receita líquida produtos", value: brl(data?.netProductRevenue ?? 0) },
      { label: "(−) CMV", value: brl(data?.totalCogs ?? 0) },
      { label: "Margem bruta", value: fmtPct(data?.grossMarginPct ?? 0) },
    ],
  });
  const openTicket = () => setDrill({
    label: "Ticket médio", value: brl(data?.avgTicket ?? 0),
    formula: "Faturamento / nº pedidos válidos (não cancelados)",
    sources: ["orders.total", "orders.status"],
    rows: data?.ordersList, columns: ordersCols,
    breakdown: [
      { label: "Faturamento", value: brl(data?.monthTotal ?? 0) },
      { label: "Pedidos", value: String(data?.ordersMonth ?? 0) },
    ],
  });
  const openAvgMargin = () => setDrill({
    label: "Margem média por pedido", value: fmtPct(data?.avgMarginPct ?? 0),
    formula: "média( (total − CMV − taxas) / total ) por pedido",
    sources: ["orders", "order_items.unit_cost"],
    rows: data?.ordersList, columns: ordersCols,
  });
  const openLowStock = () => setDrill({
    label: "Estoque baixo", value: String(data?.lowStock?.length ?? 0),
    formula: "products WHERE stock ≤ min_stock AND status = 'ativo'",
    sources: ["products.stock", "products.min_stock"],
    rows: data?.lowStock, columns: [
      { key: "n", header: "Produto", render: (p: any) => p.name },
      { key: "s", header: "Estoque", className: "text-right", render: (p: any) => p.stock },
      { key: "m", header: "Mínimo", className: "text-right", render: (p: any) => p.min_stock },
    ],
  });
  const openWallet = (w: string) => {
    const rows = (data?.ordersList ?? []).filter((o: any) => {
      if (o.payment_method_2 && o.payment_amount_1 != null) {
        return walletFor(o.channel, o.payment_method) === w || walletFor(o.channel, o.payment_method_2) === w;
      }
      return walletFor(o.channel, o.payment_method) === w;
    });
    const bruto = Number(data?.byWallet?.[w as WalletType] ?? 0);
    const taxas = Number(data?.byWalletFees?.[w as WalletType] ?? 0);
    setDrill({
      label: `Carteira — ${w}`, value: brl(bruto - taxas),
      formula: "Bruto recebido − (taxa de canal + taxa de maquininha) atribuída à carteira\nDescrição: valor que efetivamente cai (líquido) descontando taxas.",
      sources: ["orders.channel", "orders.payment_method"],
      rows, columns: ordersCols,
      breakdown: [
        { label: "Bruto recebido", value: brl(bruto) },
        { label: "(−) Taxas", value: brl(taxas) },
        { label: "(=) Líquido", value: brl(bruto - taxas) },
      ],
    });
  };
  const openTopProducts = (mode: "top" | "bottom") => {
    const ranked = data?.productsRanked ?? [];
    const rows = mode === "top" ? ranked.slice(0, 10) : ranked.slice().reverse().slice(0, 10);
    setDrill({
      label: mode === "top" ? "Produtos mais lucrativos" : "Produtos menos lucrativos",
      value: `${rows.length} produtos`,
      formula: "lucro = Σ (subtotal − unit_cost × qty) por produto no mês",
      sources: ["order_items.product_id", "order_items.subtotal", "order_items.unit_cost"],
      rows, columns: [
        { key: "n", header: "Produto", render: (p: any) => p.name },
        { key: "c", header: "Categoria", render: (p: any) => p.category ?? "—" },
        { key: "q", header: "Qtd", className: "text-right", render: (p: any) => p.qty },
        { key: "r", header: "Receita", className: "text-right tabular-nums", render: (p: any) => brl(p.revenue) },
        { key: "p", header: "Lucro", className: "text-right tabular-nums", render: (p: any) => brl(p.profit) },
        { key: "m", header: "Margem", className: "text-right tabular-nums", render: (p: any) => fmtPct(pct(p.profit, p.revenue)) },
      ],
    });
  };
  const openByCategory = () => setDrill({
    label: "Lucro por categoria", value: `${(data?.categoriesRanked ?? []).length} categorias`,
    formula: "Σ lucro por products.category no mês",
    sources: ["order_items + products.category"],
    rows: data?.categoriesRanked, columns: [
      { key: "c", header: "Categoria", render: (p: any) => p.name },
      { key: "q", header: "Qtd", className: "text-right", render: (p: any) => p.qty },
      { key: "r", header: "Receita", className: "text-right tabular-nums", render: (p: any) => brl(p.revenue) },
      { key: "p", header: "Lucro", className: "text-right tabular-nums", render: (p: any) => brl(p.profit) },
      { key: "m", header: "Margem", className: "text-right tabular-nums", render: (p: any) => fmtPct(pct(p.profit, p.revenue)) },
    ],
  });
  const openTurnover = () => setDrill({
    label: "Giro de estoque", value: `${(data?.turnover ?? []).length} produtos`,
    formula: "giro = quantidade vendida no mês / estoque atual\n(usa estoque atual quando histórico não está disponível)",
    sources: ["order_items.quantity", "products.stock"],
    rows: data?.turnover, columns: [
      { key: "n", header: "Produto", render: (p: any) => p.name },
      { key: "q", header: "Vendidos", className: "text-right", render: (p: any) => p.qty },
      { key: "s", header: "Estoque", className: "text-right", render: (p: any) => p.stock },
      { key: "t", header: "Giro", className: "text-right tabular-nums", render: (p: any) => p.turnover.toFixed(2) },
    ],
  });

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-7xl mx-auto">
      <PageHeader
        title="Dashboard"
        subtitle={`Resumo mensal — ${label} · clique em qualquer número para ver fórmula, origem e registros`}
        actions={
          <div className="flex items-center gap-2">
            <DateRangeFilter value={range} onChange={setRange} />
            <Button variant="outline" onClick={exportDashboard}><Download className="h-4 w-4 mr-1" /> Baixar</Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-3 sm:gap-4 mb-6">
        <StatCard accent label="Faturamento" value={brl(data?.monthTotal ?? 0)} icon={DollarSign} hint={`${data?.ordersMonth ?? 0} pedidos`} onClick={openRevenue} />
        <StatCard label="CMV %" value={`${(data?.cogsPct ?? 0).toFixed(1)}%`} icon={Percent} hint={brl(data?.totalCogs ?? 0)} onClick={openCogs} />
        <StatCard label="Gastos do mês" value={brl(data?.totalExpenses ?? 0)} icon={Receipt} hint="Marketing, embalagem…" onClick={openExpenses} />
        <StatCard label="Lucro líquido" value={brl(data?.realProfit ?? 0)} icon={TrendingUp} hint={`− CMV − taxas ${brl(data?.totalFees ?? 0)}`} onClick={openRealProfit} />
        <StatCard label="Margem líquida" value={`${(data?.realMarginPct ?? 0).toFixed(1)}%`} icon={Percent} hint={`Bruta ${(data?.grossMarginPct ?? 0).toFixed(1)}%`} onClick={openRealProfit} />
        <StatCard label="Ticket médio" value={brl(data?.avgTicket ?? 0)} icon={Banknote} onClick={openTicket} />
        <StatCard label="Estoque baixo" value={data?.lowStock?.length ?? 0} icon={AlertTriangle} hint="Abaixo do mínimo" onClick={openLowStock} />
      </div>

      <Card className="p-5 shadow-card mb-6">
        <div className="flex items-center gap-2 mb-4">
          <FileBarChart2 className="h-4 w-4 text-primary" />
          <h3 className="font-semibold">DRE do mês</h3>
          <span className="text-xs text-muted-foreground ml-2">Demonstração do resultado · clique em uma linha para detalhar</span>
        </div>
        <div className="divide-y divide-border text-sm">
          {([
            { label: "Receita bruta (produtos)", value: data?.grossRevenue ?? 0, sign: "+", onClick: openRevenue },
            { label: "Descontos concedidos", value: -(data?.totalDiscount ?? 0), sign: "−", onClick: openRevenue },
            { label: "Receita líquida de produtos", value: data?.netProductRevenue ?? 0, total: true, onClick: openRevenue },
            { label: `CMV (${(data?.cogsPct ?? 0).toFixed(1)}%) — apenas custo do produto`, value: -(data?.totalCogs ?? 0), sign: "−", onClick: openCogs },
            { label: `Lucro bruto (${(data?.grossMarginPct ?? 0).toFixed(1)}%)`, value: data?.grossProfit ?? 0, total: true, onClick: openGrossProfit },
            { label: "Frete cobrado", value: data?.totalShipping ?? 0, sign: "+", onClick: openRevenue },
            { label: "Taxas de canal (Site 4% · Shopee 22% · TikTok 12%)", value: -(data?.totalChannelFees ?? 0), sign: "−", onClick: openFees },
            { label: "Taxas de maquininha Infinity Pay (Déb 1,49% · Créd 4,29%)", value: -(data?.totalMachineFees ?? 0), sign: "−", onClick: openFees },
            { label: "Embalagem (sacola, papel seda, adesivo, caixa)", value: -(data?.expensesByCat?.["Embalagem"] ?? 0), sign: "−", onClick: () => openExpenseCat("Embalagem") },
            { label: "Brindes", value: -(data?.expensesByCat?.["Brindes"] ?? 0), sign: "−", onClick: () => openExpenseCat("Brindes") },
            { label: "Frete subsidiado", value: -(data?.expensesByCat?.["Frete subsidiado"] ?? 0), sign: "−", onClick: () => openExpenseCat("Frete subsidiado") },
            { label: "Marketing", value: -(data?.expensesByCat?.["Marketing"] ?? 0), sign: "−", onClick: () => openExpenseCat("Marketing") },
            { label: "Operacional (chip, internet, aluguel, software)", value: -(data?.expensesByCat?.["Operacional"] ?? 0), sign: "−", onClick: () => openExpenseCat("Operacional") },
            { label: "Outras despesas", value: -(data?.expensesByCat?.["Outros"] ?? 0), sign: "−", onClick: () => openExpenseCat("Outros") },
            { label: `Lucro líquido (${(data?.realMarginPct ?? 0).toFixed(1)}%)`, value: data?.realProfit ?? 0, total: true, highlight: true, onClick: openRealProfit },
          ] as any[]).map((row, i) => (
            <button
              key={i}
              type="button"
              onClick={row.onClick}
              className={`w-full flex items-center justify-between py-2 px-1 -mx-1 rounded text-left transition hover:bg-muted/60 ${row.total ? "font-semibold" : ""} ${row.highlight ? "text-primary" : ""}`}
            >
              <span className="flex items-center gap-2">
                {row.sign ? <span className="text-muted-foreground w-3 inline-block text-center">{row.sign}</span> : <span className="w-3" />}
                <span>{row.label}</span>
                <ChevronRight className="h-3 w-3 text-muted-foreground/60 opacity-0 group-hover:opacity-100" />
              </span>
              <span className={row.total ? "tabular-nums" : "tabular-nums text-muted-foreground"}>{brl(Math.abs(row.value))}</span>
            </button>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground mt-3">
          Pedidos cancelados ({data?.cancelledCount ?? 0}) NÃO entram em nenhum cálculo financeiro. CMV % é calculado sobre a Receita líquida de produtos (sem frete). Frete cobrado entra abaixo do lucro bruto, junto às demais entradas/saídas operacionais. Embalagem, brindes, frete subsidiado, marketing e operacional vêm de Gastos.
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
            const bruto = data?.byWallet?.[w] ?? 0;
            const taxas = data?.byWalletFees?.[w] ?? 0;
            const liquido = bruto - taxas;
            const hint = w === "Papel" ? "Dinheiro físico"
              : w === "Mercado Pago" ? "Site · Shopee · TikTok"
              : w === "Infinity Pay" ? "Pix/Cartão presencial"
              : "Demais recebimentos";
            return (
              <button key={w} type="button" onClick={() => openWallet(w)} className="text-left rounded-lg border border-border bg-muted/30 p-4 transition hover:bg-muted hover:shadow">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">{w}</div>
                <div className="text-2xl font-bold mt-1">{brl(liquido)}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">Bruto {brl(bruto)} · Taxas {brl(taxas)}</div>
                <div className="text-[11px] text-muted-foreground mt-1">{hint}</div>
              </button>
            );
          })}
        </div>
        <p className="text-[11px] text-muted-foreground mt-3">Valor em destaque = líquido (já desconta comissão de canal e taxa da maquininha). Bruto = entrou na carteira; Taxas = quanto saiu para Site/Shopee/TikTok/Infinity Pay.</p>
      </Card>

      <Card className="p-5 shadow-card mb-6">
        <div className="flex items-center gap-2 mb-4">
          <BarChart3 className="h-4 w-4 text-primary" />
          <h3 className="font-semibold">Indicadores</h3>
          <span className="text-xs text-muted-foreground ml-2">Clique para detalhar</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatCard label="Ticket médio" value={brl(data?.avgTicket ?? 0)} icon={Banknote} onClick={openTicket} />
          <StatCard label="Margem média" value={fmtPct(data?.avgMarginPct ?? 0)} icon={Percent} onClick={openAvgMargin} hint="por pedido" />
          <StatCard label="Lucro por categoria" value={`${(data?.categoriesRanked ?? []).length}`} icon={Tag} onClick={openByCategory} hint="categorias com venda" />
          <StatCard label="Mais lucrativos" value={`${Math.min(10, (data?.productsRanked ?? []).length)}`} icon={TrendingUp} onClick={() => openTopProducts("top")} hint="top 10 produtos" />
          <StatCard label="Menos lucrativos" value={`${Math.min(10, (data?.productsRanked ?? []).length)}`} icon={AlertTriangle} onClick={() => openTopProducts("bottom")} hint="bottom 10 produtos" />
          <StatCard label="Giro de estoque" value={`${(data?.turnover ?? []).length}`} icon={Boxes} onClick={openTurnover} hint="produtos com saída" />
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

      {drill && (
        <MetricDrillDown
          open={!!drill}
          onOpenChange={(v) => !v && setDrill(null)}
          label={drill.label}
          value={drill.value}
          formula={drill.formula}
          sources={drill.sources}
          description={drill.description}
          rows={drill.rows}
          columns={drill.columns}
          breakdown={drill.breakdown}
          emptyMessage={drill.emptyMessage}
          footer={`Período: ${label}`}
        />
      )}
    </div>
  );
}
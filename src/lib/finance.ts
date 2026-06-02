// Categorias canônicas de despesa.
// Não incluem CMV (custo do produto vendido) nem taxas — ficam em linhas próprias da DRE.
export const EXPENSE_CATEGORIES = [
  "Embalagem",
  "Brindes",
  "Marketing",
  "Frete subsidiado",
  "Operacional",
  "Outros",
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

/** Normaliza categorias legadas para o conjunto canônico. */
export function canonicalExpenseCategory(raw: string | null | undefined): ExpenseCategory {
  if (!raw) return "Outros";
  const s = raw.toLowerCase().trim();
  if (s.includes("embal") || s.includes("sacola") || s.includes("papel") || s.includes("adesiv") || s.includes("caixa")) return "Embalagem";
  if (s.includes("brind")) return "Brindes";
  if (s.includes("market") || s.includes("ads") || s.includes("anún") || s.includes("anun")) return "Marketing";
  if (s.includes("frete")) return "Frete subsidiado";
  if (s.includes("chip") || s.includes("telefone") || s.includes("internet") || s.includes("aluguel") || s.includes("salário") || s.includes("salario") || s.includes("software") || s.includes("imposto") || s.includes("operac")) return "Operacional";
  if (EXPENSE_CATEGORIES.includes(raw as ExpenseCategory)) return raw as ExpenseCategory;
  return "Outros";
}

export function groupExpensesByCategory(expenses: Array<{ amount: number | string | null; category: string | null }>) {
  const out: Record<ExpenseCategory, number> = {
    "Embalagem": 0, "Brindes": 0, "Marketing": 0, "Frete subsidiado": 0, "Operacional": 0, "Outros": 0,
  };
  for (const e of expenses ?? []) {
    const cat = canonicalExpenseCategory(e.category);
    out[cat] += Number(e.amount ?? 0);
  }
  return out;
}

export const pct = (num: number, den: number) => (den > 0 ? (num / den) * 100 : 0);
export const fmtPct = (n: number) => `${n.toFixed(1)}%`;

import { channelFeeAmount, infinityPayFeeAmount, walletFor, WALLETS, type Wallet } from "./wallet";

/**
 * Calcula os totais financeiros (DRE) para uma lista de pedidos + itens + despesas.
 * Pedidos devem já vir filtrados (ex.: só pagos/concluídos do período).
 */
export function computeFinance(opts: {
  orders: any[];
  items: any[];
  expenses: any[];
}) {
  const { orders, items, expenses } = opts;
  let grossRevenue = 0, totalDiscount = 0, totalShipping = 0, netRevenue = 0;
  let totalChannelFees = 0, totalMachineFees = 0;
  const byWallet: Record<Wallet, number> = { "Papel": 0, "Mercado Pago": 0, "Infinity Pay": 0, "Outros": 0 };

  for (const o of orders) {
    const tot = Number(o.total ?? 0);
    grossRevenue += Number(o.subtotal ?? 0);
    totalDiscount += Number(o.discount ?? 0);
    totalShipping += Number(o.shipping ?? 0);
    netRevenue += tot;
    const c = o.channel, p = o.payment_method;
    totalChannelFees += channelFeeAmount(c, tot);
    if (o.payment_method_2 && o.payment_amount_1 != null) {
      const a1 = Number(o.payment_amount_1 ?? 0);
      const a2 = Number(o.payment_amount_2 ?? 0);
      byWallet[walletFor(c, p)] += a1;
      byWallet[walletFor(c, o.payment_method_2)] += a2;
      totalMachineFees += infinityPayFeeAmount(c, p, a1) + infinityPayFeeAmount(c, o.payment_method_2, a2);
    } else {
      byWallet[walletFor(c, p)] += tot;
      totalMachineFees += infinityPayFeeAmount(c, p, tot);
    }
  }
  const totalFees = totalChannelFees + totalMachineFees;
  const orderIds = new Set(orders.map((o) => o.id));
  const itemsOfPeriod = items.filter((i) => orderIds.has(i.order_id));
  const cogs = itemsOfPeriod.reduce((s, i) => s + Number(i.unit_cost ?? 0) * Number(i.quantity ?? 0), 0);
  const totalExpenses = expenses.reduce((s, e) => s + Number(e.amount ?? 0), 0);
  const grossProfit = netRevenue - cogs;
  const netProfit = grossProfit - totalFees - totalExpenses;
  return {
    ordersCount: orders.length,
    grossRevenue, totalDiscount, totalShipping, netRevenue,
    cogs, totalChannelFees, totalMachineFees, totalFees, totalExpenses,
    grossProfit, netProfit,
    byWallet,
    cogsPct: pct(cogs, netRevenue),
    grossMarginPct: pct(grossProfit, netRevenue),
    netMarginPct: pct(netProfit, netRevenue),
  };
}

export { WALLETS };
export type { Wallet };
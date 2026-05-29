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
export const CHANNEL_FEES = {
  site: 0.04,
  shopee: 0.22,
  tiktok: 0.12,
} as const;

/**
 * Taxas da maquininha Infinity Pay (presencial).
 * Pix = 0%, Débito = 1,49%, Crédito à vista = 4,29%.
 * Ajuste aqui se sua tabela for diferente.
 */
export const INFINITY_FEES = {
  pix: 0,
  cartao_debito: 0.0149,
  cartao_credito: 0.0429,
} as const;

export type Channel = keyof typeof CHANNEL_FEES;

export const CHANNEL_LABEL: Record<Channel, string> = {
  site: "Site",
  shopee: "Shopee",
  tiktok: "TikTok Shop",
};

export function totalCost(cost: number, packaging: number, other: number) {
  return Number(cost || 0) + Number(packaging || 0) + Number(other || 0);
}

/**
 * Calcula preço de venda usando MARGEM DE LUCRO sobre o preço de venda.
 * Definição: lucro_líquido = preço × (1 − comissão) − custo_total
 *            margem        = lucro_líquido / preço
 * Fórmula:   preço         = custo_total / (1 − comissão − margem)
 *
 * Ex.: custo R$10, comissão 4%, margem 30% → preço = 10 / (1 - 0,04 - 0,30) = R$15,15
 */
export function calcPrice(cost: number, packaging: number, other: number, marginPct: number, channel: Channel): number | null {
  const ct = totalCost(cost, packaging, other);
  if (ct <= 0) return null;
  const m = Number(marginPct || 0) / 100;
  const denom = 1 - CHANNEL_FEES[channel] - m;
  if (denom <= 0) return null;
  return Math.round((ct / denom) * 100) / 100;
}

export function calcAllPrices(cost: number, packaging: number, other: number, marginPct: number) {
  return {
    site: calcPrice(cost, packaging, other, marginPct, "site"),
    shopee: calcPrice(cost, packaging, other, marginPct, "shopee"),
    tiktok: calcPrice(cost, packaging, other, marginPct, "tiktok"),
  };
}

/**
 * Calcula a MARGEM DE LUCRO (%) sobre o preço de venda quando o preço é informado.
 * Fórmula: margem = (preço × (1 − comissão) − custo_total) / preço
 */
export function marginFromPrice(price: number, cost: number, packaging: number, other: number, channel: Channel): number | null {
  const p = Number(price || 0);
  if (p <= 0) return null;
  const ct = totalCost(cost, packaging, other);
  if (ct <= 0) return null;
  const m = (p * (1 - CHANNEL_FEES[channel]) - ct) / p;
  return Math.round(m * 1000) / 10; // ex: 0.6025 -> 60.3
}
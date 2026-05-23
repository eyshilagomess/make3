export const CHANNEL_FEES = {
  site: 0.04,
  shopee: 0.22,
  tiktok: 0.12,
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
 * Calcula preço de venda que cobre o custo total + comissão do canal + margem desejada.
 * Fórmula: preço = custo_total / (1 - comissão - margem)
 * Se a soma de comissão + margem ≥ 1, retorna null (impossível).
 */
export function calcPrice(cost: number, packaging: number, other: number, marginPct: number, channel: Channel): number | null {
  const ct = totalCost(cost, packaging, other);
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
 * Calcula a margem (em %) implícita quando o preço de venda de um canal é informado manualmente.
 * Fórmula: margem = 1 − comissão − custo_total / preço
 * Retorna null se o preço for inválido (≤ 0).
 */
export function marginFromPrice(price: number, cost: number, packaging: number, other: number, channel: Channel): number | null {
  const p = Number(price || 0);
  if (p <= 0) return null;
  const ct = totalCost(cost, packaging, other);
  const m = 1 - CHANNEL_FEES[channel] - ct / p;
  return Math.round(m * 1000) / 10; // ex: 0.3025 -> 30.3
}
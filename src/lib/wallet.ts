import { CHANNEL_FEES, INFINITY_FEES } from "./pricing";

export type Wallet = "Papel" | "Mercado Pago" | "Infinity Pay" | "Outros";

export const WALLETS: Wallet[] = ["Papel", "Mercado Pago", "Infinity Pay", "Outros"];

export function walletFor(channel: string | null | undefined, paymentMethod: string | null | undefined): Wallet {
  if (paymentMethod === "dinheiro") return "Papel";
  if (channel === "site" || channel === "shopee" || channel === "tiktok_shop") return "Mercado Pago";
  if (channel === "presencial" && (paymentMethod === "pix" || paymentMethod === "cartao_credito" || paymentMethod === "cartao_debito")) return "Infinity Pay";
  return "Outros";
}

/**
 * Estima a comissão do canal sobre o total do pedido.
 * Site=4%, Shopee=22%, TikTok=12%. Demais canais=0.
 */
export function channelFeeAmount(channel: string | null | undefined, total: number): number {
  if (channel === "site") return total * CHANNEL_FEES.site;
  if (channel === "shopee") return total * CHANNEL_FEES.shopee;
  if (channel === "tiktok_shop") return total * CHANNEL_FEES.tiktok;
  return 0;
}

/**
 * Taxa da maquininha Infinity Pay sobre pagamentos presenciais.
 * Aplicada a Pix/Débito/Crédito quando o canal é "presencial".
 */
export function infinityPayFeeAmount(channel: string | null | undefined, paymentMethod: string | null | undefined, amount: number): number {
  if (channel !== "presencial" || !paymentMethod) return 0;
  const rate = (INFINITY_FEES as Record<string, number>)[paymentMethod] ?? 0;
  return amount * rate;
}

/**
 * Soma todas as taxas (canal + maquininha) considerando até dois métodos de pagamento.
 */
export function orderFeesTotal(order: {
  channel: string | null | undefined;
  payment_method: string | null | undefined;
  payment_method_2?: string | null | undefined;
  payment_amount_1?: number | null | undefined;
  payment_amount_2?: number | null | undefined;
  total: number;
}): number {
  const channelFee = channelFeeAmount(order.channel, order.total);
  if (order.payment_method_2 && order.payment_amount_1 != null) {
    const a1 = Number(order.payment_amount_1 ?? 0);
    const a2 = Number(order.payment_amount_2 ?? 0);
    return channelFee
      + infinityPayFeeAmount(order.channel, order.payment_method, a1)
      + infinityPayFeeAmount(order.channel, order.payment_method_2, a2);
  }
  return channelFee + infinityPayFeeAmount(order.channel, order.payment_method, order.total);
}
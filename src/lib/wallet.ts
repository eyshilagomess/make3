import { CHANNEL_FEES } from "./pricing";

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
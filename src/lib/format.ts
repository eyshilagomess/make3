export const brl = (n: number | string | null | undefined) => {
  const v = typeof n === "string" ? Number(n) : (n ?? 0);
  return (v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
};

export const dateBR = (d: string | Date | null | undefined) => {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
};

export const dateTimeBR = (d: string | Date | null | undefined) => {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

export const channelLabel = (c: string | null | undefined) => {
  const map: Record<string, string> = {
    presencial: "Presencial",
    site: "Site",
    instagram: "Instagram",
    shopee: "Shopee",
    tiktok_shop: "TikTok Shop",
    woocommerce: "WooCommerce",
    whatsapp: "WhatsApp",
    outros: "Outros",
  };
  return c ? map[c] ?? c : "—";
};

export const paymentMethodLabel = (c: string | null | undefined) => {
  const map: Record<string, string> = {
    pix: "Pix",
    cartao_credito: "Cartão crédito",
    cartao_debito: "Cartão débito",
    dinheiro: "Dinheiro",
    boleto: "Boleto",
    transferencia: "Transferência",
    outros: "Outros",
  };
  return c ? map[c] ?? c : "—";
};

export const orderStatusLabel = (s: string) => {
  const map: Record<string, string> = {
    pendente: "Pendente",
    em_preparacao: "Em preparação",
    enviado: "Enviado",
    entregue: "Entregue",
    cancelado: "Cancelado",
    devolvido: "Devolvido",
  };
  return map[s] ?? s;
};

export const paymentStatusLabel = (s: string) => {
  const map: Record<string, string> = {
    pendente: "Pendente",
    aguardando_conferencia: "Aguardando conferência",
    confirmado: "Confirmado",
    estornado: "Estornado",
  };
  return map[s] ?? s;
};

export const movementTypeLabel = (s: string) => {
  const map: Record<string, string> = {
    entrada: "Entrada",
    saida: "Saída",
    ajuste: "Ajuste",
    devolucao: "Devolução",
    perda: "Perda",
    brinde: "Brinde",
    uso_interno: "Uso interno",
    vencimento: "Vencimento",
    erro_contagem: "Erro de contagem",
  };
  return map[s] ?? s;
};

export const CHANNELS = ["presencial","site","instagram","shopee","tiktok_shop","woocommerce","whatsapp","outros"] as const;
export const PAYMENT_METHODS = ["pix","cartao_credito","cartao_debito","dinheiro","boleto","transferencia","outros"] as const;
export const PAYMENT_STATUSES = ["pendente","aguardando_conferencia","confirmado","estornado"] as const;
export const ORDER_STATUSES = ["pendente","em_preparacao","enviado","entregue","cancelado","devolvido"] as const;
export const MOVEMENT_TYPES = ["entrada","saida","ajuste","devolucao","perda","brinde","uso_interno","vencimento","erro_contagem"] as const;
// Server-only helpers: send emails via Resend + insert in-app notifications.
// Do NOT import from client code (route/component files). Import only inside
// server function handlers or server route handlers.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

type SendArgs = {
  to: string | string[];
  subject: string;
  html: string;
  replyTo?: string;
};

export async function sendEmail({ to, subject, html, replyTo }: SendArgs) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM || "Make 3 <onboarding@resend.dev>";
  if (!key) {
    console.warn("[notify] RESEND_API_KEY missing — skipping email");
    return { skipped: true };
  }
  const body: Record<string, unknown> = {
    from,
    to: Array.isArray(to) ? to : [to],
    subject,
    html,
  };
  if (replyTo) body.reply_to = replyTo;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    console.error("[notify] resend failed", res.status, t);
    return { ok: false, status: res.status, error: t };
  }
  return { ok: true };
}

export async function notify(args: {
  type: string;
  title: string;
  message?: string;
  data?: Record<string, unknown>;
}) {
  const { error } = await supabaseAdmin.from("notifications").insert({
    type: args.type,
    title: args.title,
    message: args.message ?? null,
    data: (args.data ?? null) as any,
  });
  if (error) console.error("[notify] insert error", error);
}

const BRAND = "#e91e63";

function shell(title: string, inner: string) {
  return `<!doctype html><html><body style="margin:0;background:#fff;font-family:Arial,sans-serif;color:#111">
  <div style="max-width:560px;margin:0 auto;padding:24px">
    <div style="border-top:4px solid ${BRAND};padding:16px 0">
      <h1 style="margin:0 0 8px;font-size:20px;color:${BRAND}">${title}</h1>
    </div>
    ${inner}
    <hr style="border:none;border-top:1px solid #eee;margin:24px 0" />
    <p style="color:#888;font-size:12px;margin:0">Make 3 — Beleza e maquiagem</p>
  </div></body></html>`;
}

const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export type OrderEmailInfo = {
  order_code?: string | null;
  channel?: string | null;
  total: number;
  customer_name?: string | null;
  customer_email?: string | null;
  items?: Array<{ product_name: string; variant_name?: string | null; quantity: number; unit_price: number }>;
  tracking_code?: string | null;
  carrier?: string | null;
};

export function renderOwnerNewOrderEmail(o: OrderEmailInfo) {
  const rows = (o.items ?? [])
    .map(
      (i) => `<tr>
        <td style="padding:6px 8px;border-bottom:1px solid #eee">${i.quantity}× ${i.product_name}${i.variant_name ? ` — ${i.variant_name}` : ""}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">${brl(i.unit_price * i.quantity)}</td>
      </tr>`,
    )
    .join("");
  return shell(
    `🛒 Novo pedido ${o.order_code ?? ""}`,
    `<p><b>Cliente:</b> ${o.customer_name ?? "—"}${o.customer_email ? ` (${o.customer_email})` : ""}</p>
     <p><b>Canal:</b> ${o.channel ?? "—"}</p>
     <p><b>Total:</b> ${brl(o.total)}</p>
     ${rows ? `<table style="width:100%;border-collapse:collapse;margin-top:12px">${rows}</table>` : ""}`,
  );
}

export function renderCustomerShippedEmail(o: OrderEmailInfo) {
  return shell(
    `📦 Seu pedido foi enviado!`,
    `<p>Oi ${o.customer_name ?? ""}, seu pedido <b>${o.order_code ?? ""}</b> saiu para entrega.</p>
     ${o.tracking_code ? `<p><b>Código de rastreio:</b> ${o.tracking_code}${o.carrier ? ` (${o.carrier})` : ""}</p>` : ""}
     <p>Total: ${brl(o.total)}</p>
     <p>Qualquer dúvida, fala com a gente. Obrigada por comprar na Make 3! 💖</p>`,
  );
}

export function renderCustomerDeliveredEmail(o: OrderEmailInfo) {
  return shell(
    `✨ Seu pedido foi entregue!`,
    `<p>Oi ${o.customer_name ?? ""}, seu pedido <b>${o.order_code ?? ""}</b> foi entregue.</p>
     <p>Se puder, comente com a gente o que achou dos produtos! Muito obrigada 💖</p>`,
  );
}

export function renderCustomerNewOrderEmail(o: OrderEmailInfo) {
  const rows = (o.items ?? [])
    .map(
      (i) => `<tr>
        <td style="padding:6px 8px;border-bottom:1px solid #eee">${i.quantity}× ${i.product_name}${i.variant_name ? ` — ${i.variant_name}` : ""}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">${brl(i.unit_price * i.quantity)}</td>
      </tr>`,
    )
    .join("");
  return shell(
    `💖 Recebemos seu pedido!`,
    `<p>Oi ${o.customer_name ?? ""}, recebemos seu pedido <b>${o.order_code ?? ""}</b> e já estamos preparando com carinho.</p>
     <p><b>Total:</b> ${brl(o.total)}</p>
     ${rows ? `<table style="width:100%;border-collapse:collapse;margin-top:12px">${rows}</table>` : ""}
     <p style="margin-top:16px">Assim que enviarmos, você recebe o código de rastreio por aqui. Obrigada por comprar com a Make 3! ✨</p>`,
  );
}
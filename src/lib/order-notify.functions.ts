import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Kind = "created" | "shipped" | "delivered";

export const notifyOrderEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => {
    const input = raw as { orderId?: string; kind?: Kind };
    if (!input?.orderId) throw new Error("orderId obrigatório");
    if (!input?.kind) throw new Error("kind obrigatório");
    return { orderId: input.orderId, kind: input.kind };
  })
  .handler(async ({ data, context }) => {
    const { orderId, kind } = data;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const notify: typeof import("./notify.server") = await import("./notify.server");

    const { data: order, error } = await context.supabase
      .from("orders")
      .select(
        "id, order_code, channel, total, tracking_code, shipping_carrier, customers(name,email), order_items(product_name,variant_name,quantity,unit_price)"
      )
      .eq("id", orderId)
      .maybeSingle();
    if (error || !order) return { ok: false, error: error?.message ?? "not_found" };

    const info: notify.OrderEmailInfo = {
      order_code: order.order_code,
      channel: order.channel as any,
      total: Number(order.total ?? 0),
      customer_name: (order.customers as any)?.name ?? null,
      customer_email: (order.customers as any)?.email ?? null,
      items: (order.order_items ?? []) as any,
      tracking_code: (order as any).tracking_code ?? null,
      carrier: (order as any).shipping_carrier ?? null,
    };

    if (kind === "created") {
      const to = [
        process.env.MAIL_OWNER,
        process.env.MAIL_STORE,
      ].filter((x): x is string => !!x);
      if (to.length > 0) {
        await notify.sendEmail({
          to,
          subject: `🛒 Novo pedido ${order.order_code ?? ""} — ${info.customer_name ?? ""}`,
          html: notify.renderOwnerNewOrderEmail(info),
        });
      }
      // usa supabaseAdmin para bypassar RLS (notificação da equipe)
      await supabaseAdmin.from("notifications").insert({
        type: "order_created",
        title: `Novo pedido ${order.order_code ?? ""}`,
        message: `${info.customer_name ?? "Cliente"} · ${info.channel ?? ""} · R$ ${info.total.toFixed(2)}`,
        data: { order_id: order.id } as any,
      });
    } else if (kind === "shipped") {
      if (info.customer_email) {
        await notify.sendEmail({
          to: info.customer_email,
          subject: `📦 Seu pedido ${order.order_code ?? ""} foi enviado`,
          html: notify.renderCustomerShippedEmail(info),
        });
      }
      await supabaseAdmin.from("notifications").insert({
        type: "order_shipped",
        title: `Pedido enviado: ${order.order_code ?? ""}`,
        data: { order_id: order.id } as any,
      });
    } else if (kind === "delivered") {
      if (info.customer_email) {
        await notify.sendEmail({
          to: info.customer_email,
          subject: `✨ Seu pedido ${order.order_code ?? ""} foi entregue`,
          html: notify.renderCustomerDeliveredEmail(info),
        });
      }
      await supabaseAdmin.from("notifications").insert({
        type: "order_delivered",
        title: `Pedido entregue: ${order.order_code ?? ""}`,
        data: { order_id: order.id } as any,
      });
    }
    return { ok: true };
  });
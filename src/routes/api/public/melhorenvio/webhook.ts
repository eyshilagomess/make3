import { createFileRoute } from "@tanstack/react-router";

function ok(body: unknown = { ok: true }) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
function bad(msg: string, status = 400) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// Melhor Envio v2 dispara webhooks (order.posted, order.delivered, order.canceled,
// tracking.updated, etc.) para uma URL cadastrada no painel. Não há assinatura
// HMAC padrão, então protegemos via ?token= na URL cadastrada.
//
// URL a cadastrar no Melhor Envio:
//   https://make3.lovable.app/api/public/melhorenvio/webhook?token=<MELHOR_ENVIO_WEBHOOK_SECRET>

type MEEvent = {
  event?: string;
  type?: string;
  data?: any;
  order?: any;
  tracking?: string;
  protocol?: string;
};

export const Route = createFileRoute("/api/public/melhorenvio/webhook")({
  server: {
    handlers: {
      OPTIONS: async () =>
        new Response(null, {
          status: 204,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
          },
        }),
      POST: async ({ request }) => {
        const secret = process.env.MELHOR_ENVIO_WEBHOOK_SECRET;
        if (!secret) return bad("webhook_not_configured", 500);

        const url = new URL(request.url);
        const token =
          url.searchParams.get("token") ??
          request.headers.get("x-webhook-token") ??
          "";
        if (token !== secret) return bad("invalid_token", 401);

        let payload: MEEvent;
        try {
          payload = (await request.json()) as MEEvent;
        } catch {
          return bad("invalid_json");
        }

        const eventName = String(payload.event ?? payload.type ?? "").toLowerCase();
        const data = payload.data ?? payload.order ?? payload;

        // Referências possíveis pra encontrar o pedido:
        const tracking: string | null =
          data?.tracking ?? data?.tracking_code ?? payload.tracking ?? null;
        const protocol: string | null =
          data?.protocol ?? data?.self_tracking ?? payload.protocol ?? null;
        const externalRef: string | null =
          data?.external_reference ?? data?.order_id ?? data?.reference ?? null;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Tenta localizar por tracking_code, depois por order_code/external_reference
        let order: { id: string; status: string | null; order_code: string | null } | null = null;

        if (tracking) {
          const { data: r } = await supabaseAdmin
            .from("orders")
            .select("id, status, order_code")
            .eq("tracking_code", tracking)
            .maybeSingle();
          order = (r as any) ?? null;
        }
        if (!order && externalRef) {
          const { data: r } = await supabaseAdmin
            .from("orders")
            .select("id, status, order_code")
            .or(`order_code.eq.${externalRef},external_reference.eq.${externalRef}`)
            .maybeSingle();
          order = (r as any) ?? null;
        }

        if (!order) {
          // devolve 200 pra Melhor Envio não ficar reenviando indefinidamente
          return ok({ ok: true, skipped: "order_not_found", tracking, externalRef });
        }

        // Mapeia evento → status interno
        let nextStatus: string | null = null;
        let notifyKind: "shipped" | "delivered" | null = null;

        if (
          eventName.includes("posted") ||
          eventName.includes("shipped") ||
          eventName.includes("in_transit") ||
          eventName === "tracking.updated"
        ) {
          if (order.status !== "enviado" && order.status !== "entregue") {
            nextStatus = "enviado";
            notifyKind = "shipped";
          }
        } else if (eventName.includes("delivered") || eventName.includes("entregue")) {
          nextStatus = "entregue";
          notifyKind = "delivered";
        } else if (eventName.includes("cancel")) {
          nextStatus = "cancelado";
        }

        const updates: Record<string, unknown> = {};
        if (nextStatus) updates.status = nextStatus;
        if (tracking) updates.tracking_code = tracking;
        if (protocol) updates.shipping_protocol = protocol;

        if (Object.keys(updates).length > 0) {
          await supabaseAdmin.from("orders").update(updates as any).eq("id", order.id);
        }

        // Notifica cliente + registra notificação interna
        if (notifyKind) {
          try {
            const notify: typeof import("@/lib/notify.server") = await import(
              "@/lib/notify.server"
            );
            const { data: full } = await supabaseAdmin
              .from("orders")
              .select(
                "id, order_code, channel, total, tracking_code, shipping_carrier, customers(name,email), order_items(product_name,variant_name,quantity,unit_price)"
              )
              .eq("id", order.id)
              .maybeSingle();
            if (full) {
              const info = {
                order_code: (full as any).order_code,
                channel: (full as any).channel,
                total: Number((full as any).total ?? 0),
                customer_name: (full as any).customers?.name ?? null,
                customer_email: (full as any).customers?.email ?? null,
                items: ((full as any).order_items ?? []) as any,
                tracking_code: (full as any).tracking_code ?? tracking,
                carrier: (full as any).shipping_carrier ?? "Correios",
              };
              if (info.customer_email) {
                const subject =
                  notifyKind === "shipped"
                    ? `📦 Seu pedido ${info.order_code ?? ""} foi enviado`
                    : `✨ Seu pedido ${info.order_code ?? ""} foi entregue`;
                const html =
                  notifyKind === "shipped"
                    ? notify.renderCustomerShippedEmail(info as any)
                    : notify.renderCustomerDeliveredEmail(info as any);
                await notify.sendEmail({ to: info.customer_email, subject, html });
              }
              await supabaseAdmin.from("notifications").insert({
                type: notifyKind === "shipped" ? "order_shipped" : "order_delivered",
                title:
                  notifyKind === "shipped"
                    ? `Pedido enviado: ${info.order_code ?? ""}`
                    : `Pedido entregue: ${info.order_code ?? ""}`,
                message: `Melhor Envio · ${eventName}`,
                data: { order_id: order.id, tracking } as any,
              });
            }
          } catch (e) {
            console.error("[melhorenvio.webhook] notify failed", e);
          }
        }

        return ok({ ok: true, order_id: order.id, event: eventName, status: nextStatus });
      },
    },
  },
});
import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "node:crypto";

function ok() { return new Response("ok", { status: 200 }); }
function bad(msg: string, status = 400) { return new Response(msg, { status }); }

export const Route = createFileRoute("/api/public/infinitypay/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.INFINITYPAY_WEBHOOK_SECRET;
        if (!secret) return bad("webhook_not_configured", 500);

        const raw = await request.text();
        const sig =
          request.headers.get("x-infinitypay-signature") ??
          request.headers.get("x-signature") ??
          "";

        const expected = createHmac("sha256", secret).update(raw).digest("hex");
        const a = Buffer.from(sig);
        const b = Buffer.from(expected);
        if (a.length !== b.length || !timingSafeEqual(a, b)) {
          return bad("invalid_signature", 401);
        }

        let event: any;
        try { event = JSON.parse(raw); } catch { return bad("invalid_json", 400); }

        // Expected shape (adaptar quando tivermos o payload real da Infinity Pay):
        // { event: "payment.approved", external_reference: "M3-000123", amount: 12345, method: "pix", transaction_id: "..." }
        const ref = event.external_reference ?? event.order_code ?? event.data?.external_reference;
        const status = String(event.event ?? event.status ?? "").toLowerCase();
        if (!ref) return bad("missing_reference", 400);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: order } = await supabaseAdmin
          .from("orders")
          .select("id, payment_status")
          .or(`order_code.eq.${ref},external_reference.eq.${ref}`)
          .maybeSingle();
        if (!order) return bad("order_not_found", 404);

        const approved = status.includes("approved") || status.includes("paid") || status === "payment.approved";
        const refused = status.includes("refused") || status.includes("failed") || status.includes("cancel");

        if (approved) {
          const method =
            event.method === "pix" ? "pix"
            : event.method === "debito" ? "cartao_debito"
            : "cartao_credito";
          await supabaseAdmin
            .from("orders")
            .update({
              payment_status: "confirmado" as any,
              payment_method: method as any,
              status: "entregue" as any,
            })
            .eq("id", order.id);
        } else if (refused) {
          await supabaseAdmin
            .from("orders")
            .update({ payment_status: "estornado" as any, status: "cancelado" as any })
            .eq("id", order.id);
        }

        return ok();
      },
    },
  },
});
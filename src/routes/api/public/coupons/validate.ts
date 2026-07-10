import { createFileRoute } from "@tanstack/react-router";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, x-store-key",
  "Access-Control-Max-Age": "86400",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...CORS_HEADERS },
  });
}

type Item = {
  product_id: string;
  quantity: number;
  unit_price: number;
  category_slug?: string | null;
};

type Body = {
  code: string;
  channel?: string;
  customer_email?: string | null;
  customer_phone?: string | null;
  items: Item[];
  shipping?: number;
};

export const Route = createFileRoute("/api/public/coupons/validate")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS_HEADERS }),
      POST: async ({ request }) => {
        const apiKey = process.env.STORE_API_KEY;
        if (!apiKey) return json({ valid: false, error: "store_api_key_not_configured" }, 500);
        if ((request.headers.get("x-store-key") ?? "") !== apiKey) {
          return json({ valid: false, error: "unauthorized" }, 401);
        }

        let body: Body;
        try { body = await request.json() as Body; }
        catch { return json({ valid: false, error: "invalid_json" }, 400); }

        const code = (body.code ?? "").trim().toUpperCase();
        if (!code) return json({ valid: false, error: "code_required" }, 400);
        if (!Array.isArray(body.items) || body.items.length === 0) {
          return json({ valid: false, error: "empty_cart" }, 400);
        }

        const channel = (body.channel ?? "site").toLowerCase();
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: coupon, error } = await supabaseAdmin
          .from("coupons")
          .select("*")
          .ilike("code", code)
          .maybeSingle();

        if (error) return json({ valid: false, error: "db_error", detail: error.message }, 500);
        if (!coupon) return json({ valid: false, error: "not_found", message: "Cupom não encontrado" }, 404);
        if (!coupon.active) return json({ valid: false, error: "inactive", message: "Cupom inativo" }, 400);

        const now = new Date();
        if (coupon.valid_from && new Date(coupon.valid_from) > now) {
          return json({ valid: false, error: "not_started", message: "Cupom ainda não está válido" }, 400);
        }
        if (coupon.valid_until && new Date(coupon.valid_until) < now) {
          return json({ valid: false, error: "expired", message: "Cupom expirado" }, 400);
        }

        if (Array.isArray(coupon.channels) && coupon.channels.length && !coupon.channels.includes(channel)) {
          return json({ valid: false, error: "channel_not_allowed", message: "Cupom não válido neste canal" }, 400);
        }

        if (coupon.usage_limit != null && coupon.used_count >= coupon.usage_limit) {
          return json({ valid: false, error: "usage_limit_reached", message: "Cupom esgotado" }, 400);
        }

        // Per-customer limit
        if (coupon.per_customer_limit != null && (body.customer_email || body.customer_phone)) {
          const q = supabaseAdmin
            .from("coupon_redemptions")
            .select("id", { count: "exact", head: true })
            .eq("coupon_id", coupon.id);
          const { count } = body.customer_email
            ? await q.eq("customer_email", body.customer_email)
            : await q.eq("customer_phone", body.customer_phone!);
          if ((count ?? 0) >= coupon.per_customer_limit) {
            return json({ valid: false, error: "customer_limit_reached", message: "Você já usou este cupom" }, 400);
          }
        }

        // First-purchase-only
        if (coupon.first_purchase_only && body.customer_email) {
          const { data: cust } = await supabaseAdmin
            .from("customers")
            .select("id")
            .eq("email", body.customer_email)
            .maybeSingle();
          if (cust) {
            const { count } = await supabaseAdmin
              .from("orders")
              .select("id", { count: "exact", head: true })
              .eq("customer_id", cust.id);
            if ((count ?? 0) > 0) {
              return json({ valid: false, error: "not_first_purchase", message: "Cupom válido apenas na primeira compra" }, 400);
            }
          }
        }

        // Determine eligible items
        const eligibleItems = body.items.filter((it) => {
          if (coupon.applies_to === "all") return true;
          if (coupon.applies_to === "products") {
            return Array.isArray(coupon.product_ids) && coupon.product_ids.includes(it.product_id);
          }
          if (coupon.applies_to === "categories") {
            return it.category_slug && Array.isArray(coupon.category_slugs) && coupon.category_slugs.includes(it.category_slug);
          }
          return false;
        });

        const eligibleSubtotal = eligibleItems.reduce(
          (s, it) => s + Number(it.unit_price || 0) * Number(it.quantity || 0), 0
        );
        const cartSubtotal = body.items.reduce(
          (s, it) => s + Number(it.unit_price || 0) * Number(it.quantity || 0), 0
        );

        if (eligibleSubtotal <= 0) {
          return json({ valid: false, error: "no_eligible_items", message: "Nenhum item do carrinho é elegível" }, 400);
        }

        if (Number(coupon.min_order_value || 0) > 0 && cartSubtotal < Number(coupon.min_order_value)) {
          return json({
            valid: false,
            error: "min_order_not_met",
            message: `Pedido mínimo de R$ ${Number(coupon.min_order_value).toFixed(2)}`,
            min_order_value: Number(coupon.min_order_value),
          }, 400);
        }

        // Compute discount
        let discount = 0;
        if (coupon.discount_type === "percentage") {
          discount = eligibleSubtotal * (Number(coupon.discount_value) / 100);
          if (coupon.max_discount != null) {
            discount = Math.min(discount, Number(coupon.max_discount));
          }
        } else {
          discount = Math.min(Number(coupon.discount_value), eligibleSubtotal);
        }
        discount = Math.round(discount * 100) / 100;

        const shippingBefore = Number(body.shipping || 0);
        const shippingAfter = coupon.free_shipping ? 0 : shippingBefore;
        const shippingDiscount = +(shippingBefore - shippingAfter).toFixed(2);

        return json({
          valid: true,
          coupon: {
            id: coupon.id,
            code: coupon.code,
            description: coupon.description,
            discount_type: coupon.discount_type,
            discount_value: Number(coupon.discount_value),
            free_shipping: coupon.free_shipping,
            stackable: coupon.stackable,
          },
          discount,
          shipping_discount: shippingDiscount,
          eligible_subtotal: +eligibleSubtotal.toFixed(2),
          cart_subtotal: +cartSubtotal.toFixed(2),
          new_total: +(cartSubtotal - discount + shippingAfter).toFixed(2),
        });
      },
    },
  },
});
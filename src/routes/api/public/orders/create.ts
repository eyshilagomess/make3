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

type Item = { product_id: string; variant_id?: string | null; quantity: number };
type Body = {
  customer: { name: string; email?: string | null; phone?: string | null };
  items: Item[];
  shipping: {
    cep: string;
    address?: Record<string, unknown>;
    carrier?: string;
    service?: string;
    price: number;
    deadline_days?: number;
  };
  discount?: number;
  notes?: string;
  external_reference?: string;
  payment_link?: string;
};

export const Route = createFileRoute("/api/public/orders/create")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS_HEADERS }),
      POST: async ({ request }) => {
        const apiKey = process.env.STORE_API_KEY;
        if (!apiKey) return json({ error: "store_api_key_not_configured" }, 500);
        if ((request.headers.get("x-store-key") ?? "") !== apiKey) {
          return json({ error: "unauthorized" }, 401);
        }

        let body: Body;
        try { body = await request.json() as Body; }
        catch { return json({ error: "invalid_json" }, 400); }

        if (!body?.customer?.name) return json({ error: "customer_required" }, 400);
        if (!Array.isArray(body.items) || body.items.length === 0) return json({ error: "empty_cart" }, 400);
        if (!body?.shipping?.cep) return json({ error: "shipping_required" }, 400);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Load products (server-side pricing — never trust client)
        const productIds = Array.from(new Set(body.items.map((i) => i.product_id)));
        const { data: products, error: pErr } = await supabaseAdmin
          .from("products")
          .select("id, name, price_site, price, cost, avg_cost, stock, has_variants")
          .in("id", productIds);
        if (pErr) return json({ error: "db_error", detail: pErr.message }, 500);
        const byProd = new Map((products ?? []).map((p) => [p.id, p]));

        const variantIds = body.items.map((i) => i.variant_id).filter(Boolean) as string[];
        const { data: variants } = variantIds.length
          ? await supabaseAdmin
              .from("product_variants")
              .select("id, product_id, name, extra_price, extra_cost, stock")
              .in("id", variantIds)
          : { data: [] as any[] };
        const byVar = new Map((variants ?? []).map((v) => [v.id, v]));

        // Build items + validate stock
        const orderItems: any[] = [];
        let subtotal = 0;
        for (const it of body.items) {
          const p = byProd.get(it.product_id);
          if (!p) return json({ error: "product_not_found", product_id: it.product_id }, 400);
          const qty = Math.max(1, Number(it.quantity || 1));
          let unit_price = Number(p.price_site ?? p.price ?? 0);
          let unit_cost = Number(p.avg_cost || p.cost || 0);
          let variant_name: string | null = null;
          let v: any = null;
          if (it.variant_id) {
            v = byVar.get(it.variant_id);
            if (!v || v.product_id !== p.id) return json({ error: "variant_invalid" }, 400);
            unit_price += Number(v.extra_price || 0);
            unit_cost += Number(v.extra_cost || 0);
            variant_name = v.name;
            if (v.stock < qty) return json({ error: "out_of_stock", product_id: p.id, variant_id: v.id }, 409);
          } else {
            if (p.stock < qty) return json({ error: "out_of_stock", product_id: p.id }, 409);
          }
          const sub = +(unit_price * qty).toFixed(2);
          subtotal += sub;
          orderItems.push({
            product_id: p.id,
            product_name: p.name,
            variant_id: it.variant_id ?? null,
            variant_name,
            quantity: qty,
            unit_cost,
            unit_price,
            subtotal: sub,
          });
        }

        const shippingPrice = Math.max(0, Number(body.shipping.price || 0));
        const discount = Math.max(0, Number(body.discount || 0));
        const total = +(subtotal - discount + shippingPrice).toFixed(2);

        // Upsert customer by email/phone (best-effort)
        let customer_id: string | null = null;
        const email = body.customer.email?.trim() || null;
        const phone = body.customer.phone?.trim() || null;
        if (email || phone) {
          const q = supabaseAdmin.from("customers").select("id").limit(1);
          const { data: existing } = email
            ? await q.eq("email", email)
            : await q.eq("phone", phone!);
          if (existing && existing[0]) customer_id = existing[0].id;
        }
        if (!customer_id) {
          const { data: newCust, error: cErr } = await supabaseAdmin
            .from("customers")
            .insert({ name: body.customer.name, email, phone })
            .select("id")
            .single();
          if (cErr) return json({ error: "customer_error", detail: cErr.message }, 500);
          customer_id = newCust.id;
        }

        // Create order
        const { data: order, error: oErr } = await supabaseAdmin
          .from("orders")
          .insert({
            customer_id,
            channel: "woocommerce",
            source: "site",
            status: "pendente",
            payment_status: "pendente",
            subtotal,
            discount,
            shipping: shippingPrice,
            total,
            notes: body.notes ?? null,
            external_reference: body.external_reference ?? null,
            payment_link: body.payment_link ?? null,
            shipping_cep: body.shipping.cep.replace(/\D/g, ""),
            shipping_address: (body.shipping.address ?? null) as any,
            shipping_carrier: body.shipping.carrier ?? null,
            shipping_service: body.shipping.service ?? null,
            shipping_deadline_days: body.shipping.deadline_days ?? null,
          })
          .select("id, order_code")
          .single();
        if (oErr) return json({ error: "order_error", detail: oErr.message }, 500);

        const { error: iErr } = await supabaseAdmin
          .from("order_items")
          .insert(orderItems.map((it) => ({ ...it, order_id: order.id })));
        if (iErr) {
          await supabaseAdmin.from("orders").delete().eq("id", order.id);
          return json({ error: "items_error", detail: iErr.message }, 500);
        }

        // Decrement stock
        for (const it of orderItems) {
          if (it.variant_id) {
            const v = byVar.get(it.variant_id)!;
            await supabaseAdmin.from("product_variants").update({ stock: v.stock - it.quantity }).eq("id", it.variant_id);
          } else {
            const p = byProd.get(it.product_id)!;
            await supabaseAdmin.from("products").update({ stock: p.stock - it.quantity }).eq("id", it.product_id);
          }
          await supabaseAdmin.from("stock_movements").insert({
            product_id: it.product_id,
            variant_id: it.variant_id,
            movement_type: "saida",
            quantity: it.quantity,
            reason: `Venda site (${order.order_code})`,
          });
        }

        return json({ order_id: order.id, order_code: order.order_code, total });
      },
    },
  },
});
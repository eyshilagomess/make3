import { createFileRoute } from "@tanstack/react-router";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Max-Age": "86400",
};

type CartItem = {
  product_id: string;
  variant_id?: string | null;
  quantity: number;
};

type Body = {
  to_cep?: string;
  cep?: string;
  postal_code?: string;
  to?: { postal_code?: string; cep?: string } | string;
  destination?: { cep?: string; postal_code?: string };
  items?: CartItem[];
  products?: CartItem[];
  cart?: CartItem[];
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...CORS_HEADERS },
  });
}

export const Route = createFileRoute("/api/public/shipping/calculate")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS_HEADERS }),
      POST: async ({ request }) => {
        const token = process.env.MELHOR_ENVIO_TOKEN;
        const originCep = process.env.MELHOR_ENVIO_ORIGIN_CEP;
        const env = (process.env.MELHOR_ENVIO_ENV ?? "production").toLowerCase();
        if (!token || !originCep) return json({ error: "shipping_not_configured" }, 500);

        let body: Body;
        try { body = await request.json() as Body; }
        catch (e) {
          console.error("[shipping] invalid_json", e);
          return json({ error: "invalid_json" }, 400);
        }

        const rawCep =
          body?.to_cep ??
          body?.cep ??
          body?.postal_code ??
          (typeof body?.to === "string" ? body.to : body?.to?.postal_code ?? body?.to?.cep) ??
          body?.destination?.cep ??
          body?.destination?.postal_code ??
          "";
        const to = String(rawCep ?? "").replace(/\D/g, "");
        if (to.length !== 8) {
          console.error("[shipping] invalid_cep", { rawCep, keys: Object.keys(body ?? {}) });
          return json({ error: "invalid_cep", got: rawCep, hint: "send { to_cep: '31110210', items: [{product_id, quantity}] }" }, 400);
        }
        const items = (body.items ?? body.products ?? body.cart ?? []) as CartItem[];
        if (!Array.isArray(items) || items.length === 0) {
          console.error("[shipping] empty_cart", body);
          return json({ error: "empty_cart" }, 400);
        }

        // Load real product dimensions from DB (never trust client)
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const productIds = Array.from(new Set(items.map((i) => i.product_id).filter(Boolean)));
        const { data: products, error } = await supabaseAdmin
          .from("products")
          .select("id, price_site, weight_g, length_cm, width_cm, height_cm")
          .in("id", productIds);
        if (error) return json({ error: "db_error", detail: error.message }, 500);

        const byId = new Map((products ?? []).map((p) => [p.id, p]));
        const missing = items.filter((it) => !byId.get(it.product_id)).map((it) => it.product_id);
        if (missing.length) {
          console.error("[shipping] products_not_found", missing);
          return json({ error: "product_not_found", missing }, 400);
        }
        const meProducts = items.map((it, idx) => {
          const p = byId.get(it.product_id)!;
          const qty = Math.max(1, Number(it.quantity || 1));
          return {
            id: `${idx}`,
            width: Number(p.width_cm || 15),
            height: Number(p.height_cm || 10),
            length: Number(p.length_cm || 20),
            weight: Number(p.weight_g || 200) / 1000, // Melhor Envio expects kg
            insurance_value: Number(p.price_site || 0) * qty,
            quantity: qty,
          };
        });

        const base = env === "sandbox"
          ? "https://sandbox.melhorenvio.com.br"
          : "https://melhorenvio.com.br";

        const resp = await fetch(`${base}/api/v2/me/shipment/calculate`, {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            "User-Agent": "Make3 Storefront (contato@make3.com.br)",
          },
          body: JSON.stringify({
            from: { postal_code: originCep },
            to: { postal_code: to },
            products: meProducts,
          }),
        });

        const text = await resp.text();
        if (!resp.ok) {
          console.error(`Melhor Envio ${resp.status}: ${text}`);
          return json({ error: "melhor_envio_error", status: resp.status, detail: text }, 502);
        }

        let quotes: any[] = [];
        try { quotes = JSON.parse(text); } catch { return json({ error: "invalid_response" }, 502); }

        // Return only useful fields to the storefront
        const options = (Array.isArray(quotes) ? quotes : [])
          .filter((q: any) => !q?.error && q?.price)
          .map((q: any) => ({
            id: q.id,
            name: q.name,
            company: q.company?.name ?? null,
            price: Number(q.price),
            deadline_days: Number(q.delivery_time),
          }))
          .sort((a, b) => a.price - b.price);

        return json({ options });
      },
    },
  },
});

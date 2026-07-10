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

export const Route = createFileRoute("/api/public/products/list")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS_HEADERS }),
      POST: async ({ request }) => {
        const apiKey = process.env.STORE_API_KEY;
        if (!apiKey) return json({ error: "store_api_key_not_configured" }, 500);
        const provided = request.headers.get("x-store-key") ?? "";
        if (provided !== apiKey) return json({ error: "unauthorized" }, 401);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: products, error } = await supabaseAdmin
          .from("products")
          .select(
            "id, name, sku, category, brand, photo_url, description, price_site, price, stock, min_stock, status, has_variants, weight_g, length_cm, width_cm, height_cm"
          )
          .eq("status", "ativo")
          .order("name", { ascending: true });
        if (error) return json({ error: "db_error", detail: error.message }, 500);

        const productIds = (products ?? []).map((p) => p.id);
        const { data: variants } = await supabaseAdmin
          .from("product_variants")
          .select("id, product_id, name, sku, stock, extra_price, status")
          .in("product_id", productIds.length ? productIds : ["00000000-0000-0000-0000-000000000000"]);

        const varsByProduct = new Map<string, any[]>();
        for (const v of variants ?? []) {
          if (v.status !== "ativo") continue;
          const arr = varsByProduct.get(v.product_id) ?? [];
          arr.push({
            id: v.id,
            name: v.name,
            sku: v.sku,
            stock: v.stock,
            extra_price: Number(v.extra_price || 0),
          });
          varsByProduct.set(v.product_id, arr);
        }

        const out = (products ?? []).map((p) => ({
          id: p.id,
          name: p.name,
          sku: p.sku,
          category: p.category,
          brand: p.brand,
          photo_url: p.photo_url,
          description: p.description,
          price: Number(p.price_site ?? p.price ?? 0),
          stock: p.stock,
          min_stock: p.min_stock,
          has_variants: p.has_variants,
          weight_g: p.weight_g,
          length_cm: Number(p.length_cm),
          width_cm: Number(p.width_cm),
          height_cm: Number(p.height_cm),
          variants: varsByProduct.get(p.id) ?? [],
        }));

        return json({ products: out });
      },
    },
  },
});
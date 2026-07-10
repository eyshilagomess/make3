import { createServerFn } from "@tanstack/react-start";

/**
 * Busca uma imagem de produto na internet via DuckDuckGo Images.
 * Retorna a URL da primeira imagem relevante ou null.
 */
export const searchProductImage = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => {
    const q = (input as { query?: string })?.query?.trim();
    if (!q) throw new Error("query obrigatória");
    return { query: q };
  })
  .handler(async ({ data }): Promise<{ url: string | null; candidates: string[] }> => {
    const q = data.query;
    const ua =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36";
    // 1) Obter o vqd token
    const tokenRes = await fetch(`https://duckduckgo.com/?q=${encodeURIComponent(q)}&iax=images&ia=images`, {
      headers: { "User-Agent": ua },
    });
    const html = await tokenRes.text();
    const m =
      html.match(/vqd="([^"]+)"/) ||
      html.match(/vqd='([^']+)'/) ||
      html.match(/vqd=([\d-]+)/);
    const vqd = m?.[1];
    if (!vqd) return { url: null, candidates: [] };

    // 2) Buscar imagens
    const url = `https://duckduckgo.com/i.js?l=br-pt&o=json&q=${encodeURIComponent(q)}&vqd=${encodeURIComponent(vqd)}&f=,,,,,&p=1`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": ua,
        Referer: "https://duckduckgo.com/",
        Accept: "application/json",
      },
    });
    if (!res.ok) return { url: null, candidates: [] };
    const json = (await res.json()) as { results?: Array<{ image?: string; thumbnail?: string }> };
    const candidates = (json.results ?? [])
      .map((r) => r.image || r.thumbnail)
      .filter((u): u is string => !!u)
      .slice(0, 8);
    return { url: candidates[0] ?? null, candidates };
  });
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Input = {
  name: string;
  brand?: string | null;
  category?: string | null;
  notes?: string | null;
};

export const generateProductDescription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: Input) => {
    const name = d?.name?.trim();
    if (!name) throw new Error("Nome do produto obrigatório");
    return {
      name: name.slice(0, 200),
      brand: (d.brand ?? "").toString().slice(0, 100),
      category: (d.category ?? "").toString().slice(0, 100),
      notes: (d.notes ?? "").toString().slice(0, 500),
    };
  })
  .handler(async ({ data }): Promise<{ description: string }> => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY não configurada");

    const system = `Você é copywriter de e-commerce de maquiagem e cosméticos (loja Make 3).
Escreva uma descrição de produto em português do Brasil, pronta para publicar em site, Shopee e TikTok Shop.
Regras:
- 60 a 120 palavras, tom próximo e vendedor, sem promessas de saúde.
- Comece com uma frase de impacto sobre o benefício principal.
- Depois liste de 3 a 5 tópicos curtos começando com "• " (características, benefícios, como usar).
- Não invente ingredientes, cores, volumes ou certificações que não foram informados.
- Não use markdown (nada de ** ou #), apenas texto simples com quebras de linha.
Responda APENAS com a descrição.`;

    const user = [
      `Produto: ${data.name}`,
      data.brand ? `Marca: ${data.brand}` : "",
      data.category ? `Categoria: ${data.category}` : "",
      data.notes ? `Observações: ${data.notes}` : "",
    ].filter(Boolean).join("\n");

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });

    if (res.status === 429) throw new Error("Muitas requisições, tente novamente em instantes");
    if (res.status === 402) throw new Error("Créditos de IA esgotados");
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`IA: ${res.status} ${text.slice(0, 150)}`);
    }
    const json = await res.json();
    const content = String(json?.choices?.[0]?.message?.content ?? "").trim();
    if (!content) throw new Error("Resposta vazia do modelo");
    return { description: content };
  });

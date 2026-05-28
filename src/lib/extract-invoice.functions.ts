import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type ExtractInput = { imageBase64: string; mimeType: string; kind: "invoice" | "receipt" };

export const extractFromImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: ExtractInput) => {
    if (!d?.imageBase64 || !d?.mimeType) throw new Error("Imagem inválida");
    if (!["invoice", "receipt"].includes(d.kind)) throw new Error("Tipo inválido");
    return d;
  })
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY não configurada");

    const systemInvoice = `Você extrai itens de uma nota fiscal/cupom de compra de fornecedor.
Retorne APENAS JSON válido no formato:
{"items":[{"name":"string","sku":"string|null","quantity":number,"unit_cost":number,"category":"string|null","brand":"string|null"}]}
- unit_cost = preço unitário de custo em reais.
- Não invente itens. Se algo for ilegível, ignore.`;

    const systemReceipt = `Você lê um recibo/comprovante de despesa.
Retorne APENAS JSON válido:
{"category":"Marketing|Sacolas / Embalagem|Chip / Telefone|Aluguel|Salários|Software|Frete|Impostos|Outros","amount":number,"expense_date":"YYYY-MM-DD","notes":"string"}
- amount em reais. Se a data não estiver clara, use hoje.`;

    const system = data.kind === "invoice" ? systemInvoice : systemReceipt;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: system },
          { role: "user", content: [
            { type: "text", text: "Extraia os dados da imagem. Responda somente com JSON." },
            { type: "image_url", image_url: { url: `data:${data.mimeType};base64,${data.imageBase64}` } },
          ]},
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`AI gateway: ${res.status} ${text.slice(0, 200)}`);
    }
    const json = await res.json();
    const content = json?.choices?.[0]?.message?.content;
    if (!content) throw new Error("Resposta vazia do modelo");
    try {
      return JSON.parse(content);
    } catch {
      const match = String(content).match(/\{[\s\S]*\}/);
      if (match) return JSON.parse(match[0]);
      throw new Error("JSON inválido na resposta");
    }
  });

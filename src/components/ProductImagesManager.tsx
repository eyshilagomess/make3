import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Upload, Search, Trash2, Star } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { searchProductImage } from "@/lib/search-image.functions";

const MAX = 5;
const YEAR = 60 * 60 * 24 * 365;

export function ProductImagesManager({ productId }: { productId: string }) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const searchFn = useServerFn(searchProductImage);

  const { data: images } = useQuery({
    queryKey: ["product-images", productId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_images")
        .select("*")
        .eq("product_id", productId)
        .order("position");
      if (error) throw error;
      return data ?? [];
    },
  });

  const count = images?.length ?? 0;
  const nextPos = count;

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["product-images", productId] });
    qc.invalidateQueries({ queryKey: ["products"] });
  };

  const uploadFiles = async (files: FileList | null) => {
    if (!files || !files.length) return;
    if (count + files.length > MAX) {
      toast.error(`Máximo ${MAX} imagens por produto`);
      return;
    }
    setBusy(true);
    try {
      let pos = nextPos;
      for (const file of Array.from(files)) {
        const ext = file.name.split(".").pop() || "jpg";
        const path = `${productId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const up = await supabase.storage.from("product-images").upload(path, file);
        if (up.error) throw up.error;
        const signed = await supabase.storage.from("product-images").createSignedUrl(path, YEAR);
        if (signed.error) throw signed.error;
        await supabase.from("product_images").insert({
          product_id: productId,
          url: signed.data.signedUrl,
          storage_path: path,
          source: "upload",
          position: pos,
          is_primary: pos === 0,
        });
        if (pos === 0) {
          await supabase.from("products").update({ photo_url: signed.data.signedUrl }).eq("id", productId);
        }
        pos++;
      }
      toast.success("Imagem(ns) adicionada(s)");
      invalidate();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const searchAdd = async () => {
    if (!query.trim()) return;
    if (count >= MAX) { toast.error(`Máximo ${MAX} imagens por produto`); return; }
    setBusy(true);
    try {
      const r = await searchFn({ data: { query: query.trim() } });
      if (!r.url) { toast.error("Nada encontrado"); return; }
      await supabase.from("product_images").insert({
        product_id: productId, url: r.url, source: "search",
        position: nextPos, is_primary: nextPos === 0,
      });
      if (nextPos === 0) {
        await supabase.from("products").update({ photo_url: r.url }).eq("id", productId);
      }
      toast.success("Imagem adicionada");
      setQuery("");
      invalidate();
    } catch (e: any) {
      toast.error(e.message);
    } finally { setBusy(false); }
  };

  const removeImage = async (img: any) => {
    if (!confirm("Remover esta imagem?")) return;
    if (img.storage_path) {
      await supabase.storage.from("product-images").remove([img.storage_path]);
    }
    await supabase.from("product_images").delete().eq("id", img.id);
    // se era a principal, promove a próxima
    if (img.is_primary) {
      const rest = (images ?? []).filter((i: any) => i.id !== img.id);
      const next = rest[0];
      if (next) {
        await supabase.from("product_images").update({ is_primary: true }).eq("id", next.id);
        await supabase.from("products").update({ photo_url: next.url }).eq("id", productId);
      } else {
        await supabase.from("products").update({ photo_url: null }).eq("id", productId);
      }
    }
    invalidate();
  };

  const setPrimary = async (img: any) => {
    await supabase.from("product_images").update({ is_primary: false }).eq("product_id", productId);
    await supabase.from("product_images").update({ is_primary: true }).eq("id", img.id);
    await supabase.from("products").update({ photo_url: img.url }).eq("id", productId);
    invalidate();
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-5 gap-2">
        {(images ?? []).map((img: any) => (
          <div key={img.id} className="relative aspect-square rounded-md overflow-hidden border group">
            <img src={img.url} alt="" className="w-full h-full object-cover" />
            {img.is_primary && (
              <div className="absolute top-1 left-1 bg-primary text-primary-foreground text-[10px] px-1.5 py-0.5 rounded">
                Principal
              </div>
            )}
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center gap-1">
              {!img.is_primary && (
                <Button size="icon" variant="secondary" className="h-7 w-7" onClick={() => setPrimary(img)} title="Tornar principal">
                  <Star className="h-3 w-3" />
                </Button>
              )}
              <Button size="icon" variant="destructive" className="h-7 w-7" onClick={() => removeImage(img)}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          </div>
        ))}
        {count < MAX && (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="aspect-square rounded-md border-2 border-dashed flex flex-col items-center justify-center text-xs text-muted-foreground hover:bg-muted transition"
          >
            <Upload className="h-5 w-5 mb-1" />
            Enviar
          </button>
        )}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => uploadFiles(e.target.files)}
      />
      <div className="flex gap-2">
        <Input
          placeholder="Buscar imagem na internet…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); searchAdd(); } }}
          disabled={busy || count >= MAX}
        />
        <Button type="button" variant="outline" onClick={searchAdd} disabled={busy || count >= MAX}>
          <Search className="h-4 w-4 mr-1" /> Buscar
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        {count}/{MAX} imagens · a "Principal" aparece na loja e nas listagens.
      </p>
    </div>
  );
}
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Search, Layers, Trash2, Upload, Download, Pencil, Check, X, FileText, Sparkles } from "lucide-react";
import { History, ImageIcon } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { brl } from "@/lib/format";
import { calcAllPrices, calcPrice, marginFromPrice, CHANNEL_FEES, CHANNEL_LABEL, totalCost, type Channel } from "@/lib/pricing";
import * as XLSX from "xlsx";
import { useServerFn } from "@tanstack/react-start";
import { extractFromImage } from "@/lib/extract-invoice.functions";
import { searchProductImage } from "@/lib/search-image.functions";

export const Route = createFileRoute("/_authenticated/produtos")({
  head: () => ({ meta: [{ title: "Produtos — Make 3" }] }),
  component: Page,
});

type Form = {
  name: string; sku: string; category: string; brand: string; supplier_id: string;
  photo_url: string; cost: string; packaging_cost: string; other_costs: string; target_margin: string;
  stock: string; min_stock: string;
  has_variants: boolean;
  price_site: string; price_shopee: string; price_tiktok: string;
};
const empty: Form = {
  name: "", sku: "", category: "", brand: "", supplier_id: "", photo_url: "",
  cost: "0", packaging_cost: "0", other_costs: "0", target_margin: "30",
  stock: "0", min_stock: "0", has_variants: false,
  price_site: "", price_shopee: "", price_tiktok: "",
};

function Page() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Form>(empty);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"name_asc" | "name_desc" | "recent" | "oldest" | "price_asc" | "price_desc" | "stock_asc" | "stock_desc">("name_asc");
  const [variantsFor, setVariantsFor] = useState<{ id: string; name: string } | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [historyFor, setHistoryFor] = useState<{ id: string; name: string } | null>(null);
  const [bulkImgBusy, setBulkImgBusy] = useState(false);
  const searchImgFn = useServerFn(searchProductImage);

  const fillMissingPhotos = async (onlyMissing = true) => {
    const list = (data ?? []).filter((p: any) => onlyMissing ? !p.photo_url : true);
    if (list.length === 0) { toast.info("Nada a preencher"); return; }
    if (!confirm(`Buscar imagens para ${list.length} produto(s)? Você pode alterar depois.`)) return;
    setBulkImgBusy(true);
    let ok = 0, fail = 0;
    const t = toast.loading(`Buscando imagens 0/${list.length}…`);
    for (let i = 0; i < list.length; i++) {
      const p: any = list[i];
      const q = [p.brand, p.name].filter(Boolean).join(" ").trim();
      try {
        const r = await searchImgFn({ data: { query: q } });
        if (r.url) {
          const { error } = await supabase.from("products").update({ photo_url: r.url }).eq("id", p.id);
          if (error) throw error;
          ok++;
        } else fail++;
      } catch { fail++; }
      toast.loading(`Buscando imagens ${i + 1}/${list.length}…`, { id: t });
    }
    toast.success(`Concluído: ${ok} preenchidas, ${fail} sem resultado`, { id: t });
    setBulkImgBusy(false);
    qc.invalidateQueries({ queryKey: ["products"] });
  };

  const { data } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*, suppliers(name), product_variants(id,stock,min_stock)")
        .order("name");
      if (error) throw error;
      return data;
    },
  });
  const { data: suppliers } = useQuery({
    queryKey: ["suppliers-min"],
    queryFn: async () => (await supabase.from("suppliers").select("id,name").order("name")).data ?? [],
  });

  const buildPayload = (f: Form) => ({
    name: f.name, sku: f.sku || null, category: f.category || null, brand: f.brand || null,
    supplier_id: f.supplier_id || null, photo_url: f.photo_url || null,
    cost: Number(f.cost || 0),
    packaging_cost: Number(f.packaging_cost || 0),
    other_costs: Number(f.other_costs || 0),
    target_margin: Number(f.target_margin || 0),
    stock: f.has_variants ? 0 : Number(f.stock || 0),
    min_stock: f.has_variants ? 0 : Number(f.min_stock || 0),
    has_variants: f.has_variants,
    price_site: f.price_site === "" ? null : Number(f.price_site),
    price_shopee: f.price_shopee === "" ? null : Number(f.price_shopee),
    price_tiktok: f.price_tiktok === "" ? null : Number(f.price_tiktok),
    price: f.price_site === "" ? Number(f.cost || 0) : Number(f.price_site),
  });

  const create = useMutation({
    mutationFn: async (f: Form) => {
      const { data: p, error } = await supabase.from("products").insert(buildPayload(f)).select("id").single();
      if (error) throw error;
      if (!f.has_variants && Number(f.stock) > 0) {
        await supabase.from("stock_movements").insert({
          product_id: p.id, movement_type: "entrada", quantity: Number(f.stock), reason: "Estoque inicial",
        });
      }
      return { id: p.id, name: f.name, has_variants: f.has_variants };
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["products"] });
      toast.success("Produto cadastrado!");
      setOpen(false); setForm(empty);
      if (r?.has_variants) setVariantsFor({ id: r.id, name: r.name });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const update = useMutation({
    mutationFn: async ({ id, f, oldStock }: { id: string; f: Form; oldStock: number }) => {
      const { error } = await supabase.from("products").update(buildPayload(f)).eq("id", id);
      if (error) throw error;
      if (!f.has_variants) {
        const newStock = Number(f.stock || 0);
        const diff = newStock - oldStock;
        if (diff !== 0) {
          await supabase.from("stock_movements").insert({
            product_id: id,
            movement_type: "ajuste",
            quantity: Math.abs(diff),
            reason: `Ajuste manual (${diff > 0 ? "+" : "−"}${Math.abs(diff)})`,
          });
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products"] });
      toast.success("Produto atualizado!");
      setEditingId(null); setForm(empty);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      // Apaga variantes e o produto (movimentos têm reference apenas pra pedido)
      await supabase.from("product_variants").delete().eq("product_id", id);
      const { error } = await supabase.from("products").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["products"] }); toast.success("Produto excluído"); },
    onError: (e: any) => toast.error(e.message),
  });

  const openEdit = (p: any) => {
    setForm({
      name: p.name ?? "", sku: p.sku ?? "", category: p.category ?? "", brand: p.brand ?? "",
      supplier_id: p.supplier_id ?? "", photo_url: p.photo_url ?? "",
      cost: String(p.cost ?? 0), packaging_cost: String(p.packaging_cost ?? 0),
      other_costs: String(p.other_costs ?? 0), target_margin: String(p.target_margin ?? 0),
      stock: String(p.stock ?? 0), min_stock: String(p.min_stock ?? 0),
      has_variants: !!p.has_variants,
      price_site: p.price_site != null ? String(p.price_site) : "",
      price_shopee: p.price_shopee != null ? String(p.price_shopee) : "",
      price_tiktok: p.price_tiktok != null ? String(p.price_tiktok) : "",
    });
    setEditingId(p.id);
  };

  const filtered = (() => {
    const list = (data ?? []).filter((p: any) => !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.sku?.toLowerCase().includes(search.toLowerCase()));
    const stockOf = (p: any) => p.has_variants ? (p.product_variants ?? []).reduce((s: number, v: any) => s + (v.stock ?? 0), 0) : (p.stock ?? 0);
    const priceOf = (p: any) => p.price_site != null ? Number(p.price_site) : Number.POSITIVE_INFINITY;
    const sorted = [...list];
    switch (sortBy) {
      case "name_asc": sorted.sort((a, b) => a.name.localeCompare(b.name, "pt-BR")); break;
      case "name_desc": sorted.sort((a, b) => b.name.localeCompare(a.name, "pt-BR")); break;
      case "recent": sorted.sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? "")); break;
      case "oldest": sorted.sort((a, b) => (a.created_at ?? "").localeCompare(b.created_at ?? "")); break;
      case "price_asc": sorted.sort((a, b) => priceOf(a) - priceOf(b)); break;
      case "price_desc": sorted.sort((a, b) => priceOf(b) - priceOf(a)); break;
      case "stock_asc": sorted.sort((a, b) => stockOf(a) - stockOf(b)); break;
      case "stock_desc": sorted.sort((a, b) => stockOf(b) - stockOf(a)); break;
    }
    return sorted;
  })();
  const editingProduct = editingId ? (data ?? []).find((p: any) => p.id === editingId) : null;

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-7xl mx-auto">
      <PageHeader title="Produtos" subtitle="Catálogo e controle de estoque"
        actions={
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => fillMissingPhotos(true)} disabled={bulkImgBusy}>
            <ImageIcon className="h-4 w-4 mr-1" /> {bulkImgBusy ? "Buscando…" : "Buscar fotos"}
          </Button>
          <Button variant="outline" onClick={downloadTemplate}><Download className="h-4 w-4 mr-1" /> Modelo</Button>
          <Button variant="outline" onClick={() => setImportOpen(true)}><Upload className="h-4 w-4 mr-1" /> Importar</Button>
          <Button variant="outline" onClick={() => setInvoiceOpen(true)}><FileText className="h-4 w-4 mr-1" /> Nota fiscal</Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button className="bg-gradient-brand text-primary-foreground border-0 shadow-glow"><Plus className="h-4 w-4 mr-1" /> Novo produto</Button></DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader><DialogTitle>Novo produto</DialogTitle></DialogHeader>
              <ProductForm
                form={form} setForm={setForm} suppliers={suppliers ?? []}
                submitting={create.isPending} submitLabel="Salvar"
                stockEditable={false}
                onCancel={() => setOpen(false)}
                onSubmit={() => create.mutate(form)}
              />
            </DialogContent>
          </Dialog>
        </div>
        }
      />

      <Card className="p-4 shadow-card">
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <div className="flex items-center gap-2 flex-1 min-w-[220px]">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar por nome ou SKU…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-md" />
          </div>
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as any)}>
            <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="name_asc">Nome (A → Z)</SelectItem>
              <SelectItem value="name_desc">Nome (Z → A)</SelectItem>
              <SelectItem value="recent">Mais recentes</SelectItem>
              <SelectItem value="oldest">Mais antigos</SelectItem>
              <SelectItem value="price_asc">Menor preço (Site)</SelectItem>
              <SelectItem value="price_desc">Maior preço (Site)</SelectItem>
              <SelectItem value="stock_asc">Menor estoque</SelectItem>
              <SelectItem value="stock_desc">Maior estoque</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Table>
          <TableHeader><TableRow><TableHead>Produto</TableHead><TableHead>SKU</TableHead><TableHead>Custo total</TableHead><TableHead>Site</TableHead><TableHead>Shopee</TableHead><TableHead>TikTok</TableHead><TableHead>Lucro un.</TableHead><TableHead>Margem</TableHead><TableHead>Estoque</TableHead><TableHead></TableHead></TableRow></TableHeader>
          <TableBody>
            {filtered.length === 0 && <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-12">Nenhum produto cadastrado.</TableCell></TableRow>}
            {filtered.map((p: any) => {
              const variants = p.product_variants ?? [];
              const totalStock = p.has_variants ? variants.reduce((s: number, v: any) => s + (v.stock ?? 0), 0) : p.stock;
              const lowVariant = p.has_variants && variants.some((v: any) => (v.stock ?? 0) <= (v.min_stock ?? 0));
              const low = p.has_variants ? lowVariant : p.stock <= p.min_stock;
              const ct = totalCost(p.cost, p.packaging_cost, p.other_costs);
              return (
                <TableRow key={p.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      {p.photo_url ? <img src={p.photo_url} alt="" className="h-9 w-9 rounded-md object-cover" /> : <div className="h-9 w-9 rounded-md bg-muted" />}
                      <div>
                        <div className="font-medium flex items-center gap-2">{p.name}{p.has_variants && <Badge variant="outline" className="text-[10px] py-0">{variants.length} var.</Badge>}</div>
                        <div className="text-xs text-muted-foreground">{p.brand ? `${p.brand} · ` : ""}{p.category ?? ""}{p.suppliers?.name ? ` · ${p.suppliers.name}` : ""}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{p.sku ?? "—"}</TableCell>
                  <TableCell className="text-sm">{brl(ct)}<div className="text-[10px] text-muted-foreground">margem {Number(p.target_margin ?? 0)}%</div></TableCell>
                  <TableCell className="font-semibold">{p.price_site != null ? brl(p.price_site) : "—"}</TableCell>
                  <TableCell className="font-semibold">{p.price_shopee != null ? brl(p.price_shopee) : "—"}</TableCell>
                  <TableCell className="font-semibold">{p.price_tiktok != null ? brl(p.price_tiktok) : "—"}</TableCell>
                  <TableCell className="text-sm tabular-nums">{p.price_site != null ? brl(Number(p.price_site) - ct) : "—"}</TableCell>
                  <TableCell className="text-sm tabular-nums">{p.price_site != null && Number(p.price_site) > 0 ? `${(((Number(p.price_site) - ct) / Number(p.price_site)) * 100).toFixed(1)}%` : "—"}</TableCell>
                  <TableCell>
                    <Badge variant={low ? "destructive" : "secondary"} className="font-mono">{totalStock}{p.has_variants ? ` (total)` : low ? ` / mín ${p.min_stock}` : ""}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setHistoryFor({ id: p.id, name: p.name })} title="Histórico de custo">
                        <History className="h-4 w-4" />
                      </Button>
                      {p.has_variants && (
                        <Button size="sm" variant="ghost" onClick={() => setVariantsFor({ id: p.id, name: p.name })}>
                          <Layers className="h-4 w-4 mr-1" /> Variações
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => openEdit(p)}>
                        <Pencil className="h-4 w-4 mr-1" /> Editar
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => { if (confirm(`Excluir "${p.name}"? Esta ação não pode ser desfeita.`)) remove.mutate(p.id); }}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      <VariantsDialog open={!!variantsFor} product={variantsFor} onClose={() => setVariantsFor(null)} />
      <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} onDone={() => qc.invalidateQueries({ queryKey: ["products"] })} />
      <InvoiceDialog open={invoiceOpen} onClose={() => setInvoiceOpen(false)} onDone={() => qc.invalidateQueries({ queryKey: ["products"] })} />
      <CostHistoryDialog open={!!historyFor} product={historyFor} onClose={() => setHistoryFor(null)} />
      <Dialog open={!!editingId} onOpenChange={(v) => !v && (setEditingId(null), setForm(empty))}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Editar produto {editingProduct?.name ? `— ${editingProduct.name}` : ""}</DialogTitle></DialogHeader>
          {editingProduct && (
            <ProductForm
              form={form} setForm={setForm} suppliers={suppliers ?? []}
              submitting={update.isPending} submitLabel="Atualizar"
              stockEditable={true}
              onCancel={() => { setEditingId(null); setForm(empty); }}
              onSubmit={() => update.mutate({ id: editingId!, f: form, oldStock: Number(editingProduct.stock ?? 0) })}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ProductForm({
  form, setForm, suppliers, submitting, submitLabel, stockEditable, onCancel, onSubmit,
}: {
  form: Form; setForm: (f: Form) => void; suppliers: any[];
  submitting: boolean; submitLabel: string; stockEditable: boolean;
  onCancel: () => void; onSubmit: () => void;
}) {
  // Quando custos ou margem mudam, recalcula os 3 preços.
  const recalcFromMargin = (f: Form, marginStr: string): Form => {
    const c = Number(f.cost || 0), pk = Number(f.packaging_cost || 0), o = Number(f.other_costs || 0);
    const m = Number(marginStr || 0);
    const prices = calcAllPrices(c, pk, o, m);
    return {
      ...f, target_margin: marginStr,
      price_site: prices.site != null ? String(prices.site) : "",
      price_shopee: prices.shopee != null ? String(prices.shopee) : "",
      price_tiktok: prices.tiktok != null ? String(prices.tiktok) : "",
    };
  };

  // Quando o usuário digita um preço de canal, recalcula a margem implícita
  // e atualiza os preços dos OUTROS canais usando essa nova margem.
  const onPriceChange = (channel: Channel, value: string) => {
    const next: Form = { ...form, [`price_${channel}`]: value } as Form;
    const price = Number(value || 0);
    if (price > 0) {
      const c = Number(form.cost || 0), pk = Number(form.packaging_cost || 0), o = Number(form.other_costs || 0);
      const m = marginFromPrice(price, c, pk, o, channel);
      if (m != null) {
        next.target_margin = String(m);
        (["site", "shopee", "tiktok"] as Channel[]).forEach((ch) => {
          if (ch === channel) return;
          const p = calcPrice(c, pk, o, m, ch);
          (next as any)[`price_${ch}`] = p != null ? String(p) : "";
        });
      }
    }
    setForm(next);
  };

  const onCostChange = (key: "cost" | "packaging_cost" | "other_costs", value: string) => {
    setForm(recalcFromMargin({ ...form, [key]: value }, form.target_margin));
  };

  const ct = totalCost(Number(form.cost || 0), Number(form.packaging_cost || 0), Number(form.other_costs || 0));

  const searchImg = useServerFn(searchProductImage);
  const [imgBusy, setImgBusy] = useState(false);
  const [imgCandidates, setImgCandidates] = useState<string[]>([]);

  const runImageSearch = async () => {
    const q = [form.brand, form.name].filter(Boolean).join(" ").trim();
    if (!q) return toast.error("Preencha o nome do produto primeiro");
    setImgBusy(true);
    try {
      const r = await searchImg({ data: { query: q } });
      if (!r.url) { toast.error("Nada encontrado"); return; }
      setForm({ ...form, photo_url: r.url });
      setImgCandidates(r.candidates);
      toast.success("Imagem encontrada — pode trocar por outra abaixo");
    } catch (e: any) {
      toast.error(e.message || "Erro na busca");
    } finally { setImgBusy(false); }
  };

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(); }} className="grid grid-cols-2 gap-3 max-h-[70vh] overflow-y-auto pr-2">
      <div className="col-span-2 space-y-1.5"><Label>Nome *</Label><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
      <div className="space-y-1.5"><Label>SKU</Label><Input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} /></div>
      <div className="space-y-1.5"><Label>Categoria</Label><Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Ex: Batom, Base…" /></div>
      <div className="space-y-1.5"><Label>Marca</Label><Input value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} /></div>
      <div className="space-y-1.5"><Label>Fornecedor</Label>
        <Select value={form.supplier_id} onValueChange={(v) => setForm({ ...form, supplier_id: v })}>
          <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
          <SelectContent>{suppliers.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="col-span-2 space-y-1.5">
        <Label>Foto do produto</Label>
        <div className="flex items-start gap-3">
          {form.photo_url ? (
            <img src={form.photo_url} alt="" className="h-20 w-20 rounded-md object-cover border" onError={(e) => ((e.target as HTMLImageElement).style.opacity = "0.3")} />
          ) : (
            <div className="h-20 w-20 rounded-md bg-muted border flex items-center justify-center text-[10px] text-muted-foreground text-center px-1">sem foto</div>
          )}
          <div className="flex-1 space-y-2">
            <Input value={form.photo_url} onChange={(e) => setForm({ ...form, photo_url: e.target.value })} placeholder="https://… (cole uma URL ou busque na internet)" />
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline" onClick={runImageSearch} disabled={imgBusy}>
                <Search className="h-3 w-3 mr-1" />
                {imgBusy ? "Buscando…" : "Buscar imagem na internet"}
              </Button>
              {form.photo_url && (
                <Button type="button" size="sm" variant="ghost" onClick={() => setForm({ ...form, photo_url: "" })}>
                  <X className="h-3 w-3 mr-1" /> Remover
                </Button>
              )}
            </div>
            {imgCandidates.length > 1 && (
              <div className="space-y-1">
                <div className="text-[10px] text-muted-foreground">Outras opções (clique para escolher):</div>
                <div className="flex flex-wrap gap-1.5">
                  {imgCandidates.map((u) => (
                    <button type="button" key={u} onClick={() => setForm({ ...form, photo_url: u })}
                      className={`h-12 w-12 rounded border overflow-hidden ${form.photo_url === u ? "ring-2 ring-primary" : ""}`}>
                      <img src={u} alt="" className="h-full w-full object-cover" onError={(e) => ((e.target as HTMLImageElement).style.display = "none")} />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="space-y-1.5"><Label>Custo (R$)</Label><Input type="number" step="0.01" value={form.cost} onChange={(e) => onCostChange("cost", e.target.value)} /></div>
      <div className="space-y-1.5"><Label>Embalagem (R$)</Label><Input type="number" step="0.01" value={form.packaging_cost} onChange={(e) => onCostChange("packaging_cost", e.target.value)} /></div>
      <div className="space-y-1.5"><Label>Outros custos (R$)</Label><Input type="number" step="0.01" value={form.other_costs} onChange={(e) => onCostChange("other_costs", e.target.value)} placeholder="Ex: brinde, etiqueta…" /></div>
      <div className="space-y-1.5"><Label>Margem desejada (%)</Label><Input type="number" step="0.1" value={form.target_margin} onChange={(e) => setForm(recalcFromMargin(form, e.target.value))} /></div>

      <div className="col-span-2 rounded-md border border-primary/30 bg-primary/5 p-3 space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Custo total (custo + embalagem + outros)</span>
          <span className="font-semibold">{brl(ct)}</span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {(["site", "shopee", "tiktok"] as Channel[]).map((ch) => (
            <div key={ch} className="rounded-md bg-background/70 p-2 border border-border space-y-1">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{CHANNEL_LABEL[ch]} · {(CHANNEL_FEES[ch] * 100).toFixed(0)}%</div>
              <Input
                type="number" step="0.01" className="h-8 font-semibold"
                value={ch === "site" ? form.price_site : ch === "shopee" ? form.price_shopee : form.price_tiktok}
                onChange={(e) => onPriceChange(ch, e.target.value)}
                placeholder="0,00"
              />
            </div>
          ))}
        </div>
        <p className="text-[10px] text-muted-foreground">Mexa na margem ou digite o preço final em qualquer canal — o outro lado é recalculado automaticamente.</p>
      </div>

      <div className="col-span-2 flex items-start gap-2 rounded-md border border-border p-3 bg-muted/30">
        <Checkbox id="hv" checked={form.has_variants} onCheckedChange={(v) => setForm({ ...form, has_variants: Boolean(v) })} />
        <div className="space-y-1">
          <Label htmlFor="hv" className="cursor-pointer">Este produto tem variações (cor, tom, tamanho…)</Label>
          <p className="text-xs text-muted-foreground">O estoque será controlado por variante.</p>
        </div>
      </div>
      {!form.has_variants && <>
        <div className="space-y-1.5"><Label>{stockEditable ? "Estoque atual" : "Estoque inicial"}</Label><Input type="number" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} /></div>
        <div className="space-y-1.5"><Label>Estoque mínimo</Label><Input type="number" value={form.min_stock} onChange={(e) => setForm({ ...form, min_stock: e.target.value })} /></div>
      </>}
      <div className="col-span-2 flex justify-end gap-2 mt-2">
        <Button type="button" variant="ghost" onClick={onCancel}>Cancelar</Button>
        <Button type="submit" disabled={submitting} className="bg-gradient-brand text-primary-foreground border-0">{submitting ? "Salvando…" : submitLabel}</Button>
      </div>
    </form>
  );
}

const TEMPLATE_HEADERS = ["name", "sku", "category", "brand", "cost", "packaging_cost", "other_costs", "target_margin", "min_stock", "has_variants"];
function downloadTemplate() {
  const ws = XLSX.utils.aoa_to_sheet([
    TEMPLATE_HEADERS,
    ["Base Líquida Make 3", "BASE-001", "Base", "Make 3", 18.5, 2.0, 0.5, 30, 5, "nao"],
    ["Batom Matte Vermelho", "BAT-002", "Batom", "Make 3", 7.0, 1.0, 0, 35, 3, "nao"],
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "produtos");
  XLSX.writeFile(wb, "modelo_precificacao_make3.xlsx");
}

function ImportDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [rows, setRows] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);

  const onFile = async (file: File) => {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json<any>(sheet, { defval: "" });
    setRows(data);
  };

  const importAll = async () => {
    if (rows.length === 0) return toast.error("Carregue um arquivo primeiro");
    setBusy(true);
    try {
      const payload = rows.map((r) => {
        const cost = Number(r.cost || 0);
        const pk = Number(r.packaging_cost || 0);
        const oc = Number(r.other_costs || 0);
        const m = Number(r.target_margin || 0);
        const prices = calcAllPrices(cost, pk, oc, m);
        return {
          name: String(r.name || "").trim(),
          sku: r.sku ? String(r.sku) : null,
          category: r.category ? String(r.category) : null,
          brand: r.brand ? String(r.brand) : null,
          cost, packaging_cost: pk, other_costs: oc, target_margin: m,
          price: prices.site ?? cost,
          price_site: prices.site, price_shopee: prices.shopee, price_tiktok: prices.tiktok,
          min_stock: Number(r.min_stock || 0),
          has_variants: ["sim", "yes", "true", "1"].includes(String(r.has_variants ?? "").toLowerCase().trim()),
        };
      }).filter((p) => p.name);
      if (payload.length === 0) throw new Error("Nenhuma linha válida (coluna 'name' vazia)");
      const { error } = await supabase.from("products").insert(payload);
      if (error) throw error;
      toast.success(`${payload.length} produto(s) importado(s)!`);
      setRows([]); onDone(); onClose();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Importar planilha de precificação</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Aceita .xlsx ou .csv. Use o botão <strong>Modelo</strong> para baixar o padrão. Os preços por canal (Site, Shopee, TikTok) serão calculados automaticamente.
          </p>
          <Input type="file" accept=".xlsx,.xls,.csv" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }} />
          {rows.length > 0 && (
            <div className="rounded-md border border-border max-h-72 overflow-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted sticky top-0"><tr>{TEMPLATE_HEADERS.map((h) => <th key={h} className="p-2 text-left">{h}</th>)}</tr></thead>
                <tbody>{rows.slice(0, 50).map((r, i) => (
                  <tr key={i} className="border-t border-border">{TEMPLATE_HEADERS.map((h) => <td key={h} className="p-2">{String(r[h] ?? "")}</td>)}</tr>
                ))}</tbody>
              </table>
              {rows.length > 50 && <div className="p-2 text-xs text-muted-foreground">+ {rows.length - 50} linhas</div>}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button onClick={importAll} disabled={busy || rows.length === 0} className="bg-gradient-brand text-primary-foreground border-0">
              {busy ? "Importando…" : `Importar ${rows.length || ""}`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

type VForm = { name: string; sku: string; stock: string; min_stock: string; extra_cost: string; extra_price: string };
const vEmpty: VForm = { name: "", sku: "", stock: "0", min_stock: "0", extra_cost: "0", extra_price: "0" };

function VariantsDialog({ open, product, onClose }: { open: boolean; product: { id: string; name: string } | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<VForm>(vEmpty);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<VForm>(vEmpty);

  const { data: variants } = useQuery({
    enabled: !!product?.id,
    queryKey: ["variants", product?.id],
    queryFn: async () => (await supabase.from("product_variants").select("*").eq("product_id", product!.id).order("name")).data ?? [],
  });

  const add = useMutation({
    mutationFn: async () => {
      if (!product || !form.name.trim()) throw new Error("Informe o nome da variação");
      const stock = Number(form.stock || 0);
      const { data: v, error } = await supabase.from("product_variants").insert({
        product_id: product.id,
        name: form.name.trim(),
        sku: form.sku || null,
        stock,
        min_stock: Number(form.min_stock || 0),
        extra_cost: Number(form.extra_cost || 0),
        extra_price: Number(form.extra_price || 0),
      }).select("id").single();
      if (error) throw error;
      if (stock > 0) {
        await supabase.from("stock_movements").insert({
          product_id: product.id, variant_id: v.id, movement_type: "entrada", quantity: stock, reason: "Estoque inicial",
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["variants", product?.id] });
      qc.invalidateQueries({ queryKey: ["products"] });
      setForm(vEmpty);
      toast.success("Variação adicionada");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("product_variants").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["variants", product?.id] }); qc.invalidateQueries({ queryKey: ["products"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const update = useMutation({
    mutationFn: async ({ id, oldStock }: { id: string; oldStock: number }) => {
      if (!product || !editForm.name.trim()) throw new Error("Informe o nome da variação");
      const newStock = Number(editForm.stock || 0);
      const { error } = await supabase.from("product_variants").update({
        name: editForm.name.trim(),
        sku: editForm.sku || null,
        stock: newStock,
        min_stock: Number(editForm.min_stock || 0),
        extra_cost: Number(editForm.extra_cost || 0),
        extra_price: Number(editForm.extra_price || 0),
      }).eq("id", id);
      if (error) throw error;
      const diff = newStock - oldStock;
      if (diff !== 0) {
        await supabase.from("stock_movements").insert({
          product_id: product.id, variant_id: id,
          movement_type: "ajuste", quantity: Math.abs(diff),
          reason: `Ajuste manual (${diff > 0 ? "+" : "−"}${Math.abs(diff)})`,
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["variants", product?.id] });
      qc.invalidateQueries({ queryKey: ["products"] });
      setEditingId(null); setEditForm(vEmpty);
      toast.success("Variação atualizada");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const startEdit = (v: any) => {
    setEditingId(v.id);
    setEditForm({
      name: v.name ?? "", sku: v.sku ?? "",
      stock: String(v.stock ?? 0), min_stock: String(v.min_stock ?? 0),
      extra_cost: String(v.extra_cost ?? 0), extra_price: String(v.extra_price ?? 0),
    });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Variações — {product?.name}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="rounded-md border border-border p-3 bg-muted/30 space-y-2">
            <div className="grid grid-cols-6 gap-2">
              <div className="col-span-2 space-y-1"><Label className="text-xs">Nome *</Label><Input placeholder="Cor 02 Bege Claro" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div className="space-y-1"><Label className="text-xs">SKU</Label><Input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} /></div>
              <div className="space-y-1"><Label className="text-xs">Estoque</Label><Input type="number" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} /></div>
              <div className="space-y-1"><Label className="text-xs">Mín.</Label><Input type="number" value={form.min_stock} onChange={(e) => setForm({ ...form, min_stock: e.target.value })} /></div>
              <div className="flex items-end"><Button type="button" onClick={() => add.mutate()} disabled={add.isPending} className="w-full"><Plus className="h-4 w-4" /></Button></div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1"><Label className="text-xs">+ custo (opcional)</Label><Input type="number" step="0.01" value={form.extra_cost} onChange={(e) => setForm({ ...form, extra_cost: e.target.value })} /></div>
              <div className="space-y-1"><Label className="text-xs">+ preço (opcional)</Label><Input type="number" step="0.01" value={form.extra_price} onChange={(e) => setForm({ ...form, extra_price: e.target.value })} /></div>
            </div>
          </div>

          <Table>
            <TableHeader><TableRow><TableHead>Variação</TableHead><TableHead>SKU</TableHead><TableHead>Estoque</TableHead><TableHead>Mín.</TableHead><TableHead>+ custo</TableHead><TableHead>+ preço</TableHead><TableHead></TableHead></TableRow></TableHeader>
            <TableBody>
              {(variants ?? []).length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6 text-sm">Nenhuma variação ainda.</TableCell></TableRow>}
              {(variants ?? []).map((v: any) => {
                const low = v.stock <= v.min_stock;
                if (editingId === v.id) {
                  return (
                    <TableRow key={v.id} className="bg-muted/30">
                      <TableCell><Input className="h-8" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} /></TableCell>
                      <TableCell><Input className="h-8 font-mono text-xs" value={editForm.sku} onChange={(e) => setEditForm({ ...editForm, sku: e.target.value })} /></TableCell>
                      <TableCell><Input className="h-8 w-20" type="number" value={editForm.stock} onChange={(e) => setEditForm({ ...editForm, stock: e.target.value })} /></TableCell>
                      <TableCell><Input className="h-8 w-16" type="number" value={editForm.min_stock} onChange={(e) => setEditForm({ ...editForm, min_stock: e.target.value })} /></TableCell>
                      <TableCell><Input className="h-8 w-20" type="number" step="0.01" value={editForm.extra_cost} onChange={(e) => setEditForm({ ...editForm, extra_cost: e.target.value })} /></TableCell>
                      <TableCell><Input className="h-8 w-20" type="number" step="0.01" value={editForm.extra_price} onChange={(e) => setEditForm({ ...editForm, extra_price: e.target.value })} /></TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" onClick={() => update.mutate({ id: v.id, oldStock: Number(v.stock ?? 0) })} disabled={update.isPending}><Check className="h-4 w-4 text-primary" /></Button>
                          <Button size="sm" variant="ghost" onClick={() => { setEditingId(null); setEditForm(vEmpty); }}><X className="h-4 w-4" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                }
                return (
                  <TableRow key={v.id}>
                    <TableCell className="font-medium">{v.name}</TableCell>
                    <TableCell className="font-mono text-xs">{v.sku ?? "—"}</TableCell>
                    <TableCell><Badge variant={low ? "destructive" : "secondary"} className="font-mono">{v.stock}</Badge></TableCell>
                    <TableCell className="text-xs text-muted-foreground">{v.min_stock}</TableCell>
                    <TableCell className="text-sm">{Number(v.extra_cost) ? `+${brl(v.extra_cost)}` : "—"}</TableCell>
                    <TableCell className="text-sm">{Number(v.extra_price) ? `+${brl(v.extra_price)}` : "—"}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => startEdit(v)}><Pencil className="h-4 w-4" /></Button>
                        <Button size="sm" variant="ghost" onClick={() => remove.mutate(v.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
type InvoiceItem = { name: string; sku: string | null; quantity: number; unit_cost: number; category: string | null; brand: string | null };

function CostHistoryDialog({ open, product, onClose }: { open: boolean; product: { id: string; name: string } | null; onClose: () => void }) {
  const { data } = useQuery({
    enabled: !!product?.id,
    queryKey: ["product_cost_history", product?.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("product_cost_history").select("*").eq("product_id", product!.id).order("changed_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Histórico de custo — {product?.name}</DialogTitle></DialogHeader>
        <p className="text-xs text-muted-foreground">Toda alteração no custo de compra é registrada automaticamente para auditoria.</p>
        <div className="rounded-md border max-h-[60vh] overflow-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Quando</TableHead><TableHead>De</TableHead><TableHead>Para</TableHead><TableHead>Δ</TableHead></TableRow></TableHeader>
            <TableBody>
              {(data ?? []).length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6 text-sm">Sem alterações registradas.</TableCell></TableRow>}
              {(data ?? []).map((h: any) => {
                const diff = Number(h.new_cost) - Number(h.old_cost);
                return (
                  <TableRow key={h.id}>
                    <TableCell className="text-xs">{new Date(h.changed_at).toLocaleString("pt-BR")}</TableCell>
                    <TableCell className="tabular-nums">{brl(h.old_cost)}</TableCell>
                    <TableCell className="tabular-nums font-semibold">{brl(h.new_cost)}</TableCell>
                    <TableCell className={`tabular-nums ${diff >= 0 ? "text-destructive" : "text-primary"}`}>{diff >= 0 ? "+" : ""}{brl(diff)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function InvoiceDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const extract = useServerFn(extractFromImage);
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [margin, setMargin] = useState("30");

  const onFile = async (file: File) => {
    setBusy(true);
    try {
      const buf = await file.arrayBuffer();
      let bin = ""; const bytes = new Uint8Array(buf);
      for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
      const b64 = btoa(bin);
      const r: any = await extract({ data: { imageBase64: b64, mimeType: file.type || "image/jpeg", kind: "invoice" } });
      const list = Array.isArray(r?.items) ? r.items : [];
      if (list.length === 0) throw new Error("Nenhum item identificado");
      setItems(list.map((it: any) => ({
        name: String(it.name ?? "").trim(),
        sku: it.sku || null,
        quantity: Number(it.quantity ?? 1),
        unit_cost: Number(it.unit_cost ?? 0),
        category: it.category || null,
        brand: it.brand || null,
      })));
      toast.success(`${list.length} item(ns) detectado(s)`);
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  };

  const updateItem = (i: number, patch: Partial<InvoiceItem>) => {
    setItems((arr) => arr.map((x, idx) => idx === i ? { ...x, ...patch } : x));
  };
  const removeItem = (i: number) => setItems((arr) => arr.filter((_, idx) => idx !== i));

  const importAll = async () => {
    if (items.length === 0) return toast.error("Nenhum item para importar");
    setBusy(true);
    try {
      const m = Number(margin || 0);
      const payload = items.filter(it => it.name).map((it) => {
        const prices = calcAllPrices(it.unit_cost, 0, 0, m);
        return {
          name: it.name, sku: it.sku, category: it.category, brand: it.brand,
          cost: it.unit_cost, packaging_cost: 0, other_costs: 0, target_margin: m,
          price: prices.site ?? it.unit_cost,
          price_site: prices.site, price_shopee: prices.shopee, price_tiktok: prices.tiktok,
          stock: Math.max(0, Math.floor(it.quantity)), min_stock: 0, has_variants: false,
        };
      });
      const { data: inserted, error } = await supabase.from("products").insert(payload).select("id,stock,name");
      if (error) throw error;
      const movs = (inserted ?? []).filter((p: any) => p.stock > 0).map((p: any) => ({
        product_id: p.id, movement_type: "entrada" as const, quantity: p.stock, reason: "Importado da nota fiscal",
      }));
      if (movs.length > 0) {
        await supabase.from("stock_movements").insert(movs);
      }
      toast.success(`${payload.length} produto(s) cadastrado(s) da nota`);
      setItems([]); onDone(); onClose();
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && (onClose(), setItems([]))}>
      <DialogContent className="max-w-4xl">
        <DialogHeader><DialogTitle>Importar produtos da nota fiscal</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground flex items-center gap-1">
            <Sparkles className="h-4 w-4 text-primary" /> Suba uma foto/imagem da nota — a IA extrai os itens. Você revisa e edita antes de salvar.
          </p>
          <div className="flex items-center gap-2">
            <Input type="file" accept="image/*" disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }} />
            <div className="flex items-center gap-1">
              <Label className="text-xs whitespace-nowrap">Margem %</Label>
              <Input type="number" step="0.1" className="w-20 h-9" value={margin} onChange={(e) => setMargin(e.target.value)} />
            </div>
          </div>
          {busy && items.length === 0 && <p className="text-sm text-muted-foreground">Lendo a nota…</p>}
          {items.length > 0 && (
            <div className="rounded-md border border-border max-h-96 overflow-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted sticky top-0">
                  <tr>
                    <th className="p-2 text-left">Nome</th>
                    <th className="p-2 text-left">SKU</th>
                    <th className="p-2 text-left">Categoria</th>
                    <th className="p-2 text-left">Marca</th>
                    <th className="p-2 text-left">Qtd</th>
                    <th className="p-2 text-left">Custo unit.</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, i) => (
                    <tr key={i} className="border-t border-border">
                      <td className="p-1"><Input className="h-8" value={it.name} onChange={(e) => updateItem(i, { name: e.target.value })} /></td>
                      <td className="p-1"><Input className="h-8 w-24 font-mono text-xs" value={it.sku ?? ""} onChange={(e) => updateItem(i, { sku: e.target.value })} /></td>
                      <td className="p-1"><Input className="h-8 w-28" value={it.category ?? ""} onChange={(e) => updateItem(i, { category: e.target.value })} /></td>
                      <td className="p-1"><Input className="h-8 w-24" value={it.brand ?? ""} onChange={(e) => updateItem(i, { brand: e.target.value })} /></td>
                      <td className="p-1"><Input className="h-8 w-16" type="number" value={it.quantity} onChange={(e) => updateItem(i, { quantity: Number(e.target.value) })} /></td>
                      <td className="p-1"><Input className="h-8 w-24" type="number" step="0.01" value={it.unit_cost} onChange={(e) => updateItem(i, { unit_cost: Number(e.target.value) })} /></td>
                      <td className="p-1 text-right"><Button size="sm" variant="ghost" onClick={() => removeItem(i)}><Trash2 className="h-4 w-4 text-destructive" /></Button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => { setItems([]); onClose(); }}>Cancelar</Button>
            <Button onClick={importAll} disabled={busy || items.length === 0} className="bg-gradient-brand text-primary-foreground border-0">
              {busy ? "Salvando…" : `Cadastrar ${items.length || ""} produto(s)`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

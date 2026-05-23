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
import { Plus, Search, Layers, Trash2, Upload, Download } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { brl } from "@/lib/format";
import { calcAllPrices, CHANNEL_FEES, CHANNEL_LABEL, totalCost } from "@/lib/pricing";
import * as XLSX from "xlsx";

export const Route = createFileRoute("/_authenticated/produtos")({
  head: () => ({ meta: [{ title: "Produtos — Make 3" }] }),
  component: Page,
});

type Form = {
  name: string; sku: string; category: string; brand: string; supplier_id: string;
  photo_url: string; cost: string; packaging_cost: string; other_costs: string; target_margin: string;
  stock: string; min_stock: string;
  has_variants: boolean;
};
const empty: Form = {
  name: "", sku: "", category: "", brand: "", supplier_id: "", photo_url: "",
  cost: "0", packaging_cost: "0", other_costs: "0", target_margin: "30",
  stock: "0", min_stock: "0", has_variants: false,
};

function Page() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Form>(empty);
  const [search, setSearch] = useState("");
  const [variantsFor, setVariantsFor] = useState<{ id: string; name: string } | null>(null);

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

  const create = useMutation({
    mutationFn: async (f: Form) => {
      const payload: any = {
        name: f.name, sku: f.sku || null, category: f.category || null, brand: f.brand || null,
        supplier_id: f.supplier_id || null, photo_url: f.photo_url || null,
        cost: Number(f.cost || 0), price: Number(f.price || 0),
        stock: f.has_variants ? 0 : Number(f.stock || 0),
        min_stock: f.has_variants ? 0 : Number(f.min_stock || 0),
        has_variants: f.has_variants,
      };
      const { data: p, error } = await supabase.from("products").insert(payload).select("id").single();
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

  const filtered = (data ?? []).filter((p: any) => !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.sku?.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <PageHeader title="Produtos" subtitle="Catálogo e controle de estoque"
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button className="bg-gradient-brand text-primary-foreground border-0 shadow-glow"><Plus className="h-4 w-4 mr-1" /> Novo produto</Button></DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader><DialogTitle>Novo produto</DialogTitle></DialogHeader>
              <form onSubmit={(e) => { e.preventDefault(); create.mutate(form); }} className="grid grid-cols-2 gap-3 max-h-[70vh] overflow-y-auto pr-2">
                <div className="col-span-2 space-y-1.5"><Label>Nome *</Label><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>SKU</Label><Input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>Categoria</Label><Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Ex: Batom, Base…" /></div>
                <div className="space-y-1.5"><Label>Marca</Label><Input value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>Fornecedor</Label>
                  <Select value={form.supplier_id} onValueChange={(v) => setForm({ ...form, supplier_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>{(suppliers ?? []).map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="col-span-2 space-y-1.5"><Label>URL da foto</Label><Input value={form.photo_url} onChange={(e) => setForm({ ...form, photo_url: e.target.value })} placeholder="https://…" /></div>
                <div className="space-y-1.5"><Label>Custo (R$)</Label><Input type="number" step="0.01" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>Preço de venda (R$)</Label><Input type="number" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></div>
                <div className="col-span-2 flex items-start gap-2 rounded-md border border-border p-3 bg-muted/30">
                  <Checkbox id="hv" checked={form.has_variants} onCheckedChange={(v) => setForm({ ...form, has_variants: Boolean(v) })} />
                  <div className="space-y-1">
                    <Label htmlFor="hv" className="cursor-pointer">Este produto tem variações (cor, tom, tamanho…)</Label>
                    <p className="text-xs text-muted-foreground">O estoque será controlado por variante. Você cadastra as cores/tons na próxima etapa.</p>
                  </div>
                </div>
                {!form.has_variants && <>
                  <div className="space-y-1.5"><Label>Estoque inicial</Label><Input type="number" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} /></div>
                  <div className="space-y-1.5"><Label>Estoque mínimo</Label><Input type="number" value={form.min_stock} onChange={(e) => setForm({ ...form, min_stock: e.target.value })} /></div>
                </>}
                <div className="col-span-2 flex justify-end gap-2 mt-2">
                  <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
                  <Button type="submit" disabled={create.isPending} className="bg-gradient-brand text-primary-foreground border-0">{create.isPending ? "Salvando…" : "Salvar"}</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      <Card className="p-4 shadow-card">
        <div className="flex items-center gap-2 mb-4">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por nome ou SKU…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-md" />
        </div>
        <Table>
          <TableHeader><TableRow><TableHead>Produto</TableHead><TableHead>SKU</TableHead><TableHead>Marca</TableHead><TableHead>Custo</TableHead><TableHead>Preço</TableHead><TableHead>Estoque</TableHead><TableHead></TableHead></TableRow></TableHeader>
          <TableBody>
            {filtered.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-12">Nenhum produto cadastrado.</TableCell></TableRow>}
            {filtered.map((p: any) => {
              const variants = p.product_variants ?? [];
              const totalStock = p.has_variants ? variants.reduce((s: number, v: any) => s + (v.stock ?? 0), 0) : p.stock;
              const lowVariant = p.has_variants && variants.some((v: any) => (v.stock ?? 0) <= (v.min_stock ?? 0));
              const low = p.has_variants ? lowVariant : p.stock <= p.min_stock;
              return (
                <TableRow key={p.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      {p.photo_url ? <img src={p.photo_url} alt="" className="h-9 w-9 rounded-md object-cover" /> : <div className="h-9 w-9 rounded-md bg-muted" />}
                      <div>
                        <div className="font-medium flex items-center gap-2">{p.name}{p.has_variants && <Badge variant="outline" className="text-[10px] py-0">{variants.length} var.</Badge>}</div>
                        <div className="text-xs text-muted-foreground">{p.category ?? ""} {p.suppliers?.name ? `· ${p.suppliers.name}` : ""}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{p.sku ?? "—"}</TableCell>
                  <TableCell>{p.brand ?? "—"}</TableCell>
                  <TableCell>{brl(p.cost)}</TableCell>
                  <TableCell className="font-semibold">{brl(p.price)}</TableCell>
                  <TableCell>
                    <Badge variant={low ? "destructive" : "secondary"} className="font-mono">{totalStock}{p.has_variants ? ` (total)` : low ? ` / mín ${p.min_stock}` : ""}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {p.has_variants && (
                      <Button size="sm" variant="ghost" onClick={() => setVariantsFor({ id: p.id, name: p.name })}>
                        <Layers className="h-4 w-4 mr-1" /> Variações
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      <VariantsDialog open={!!variantsFor} product={variantsFor} onClose={() => setVariantsFor(null)} />
    </div>
  );
}

type VForm = { name: string; sku: string; stock: string; min_stock: string; extra_cost: string; extra_price: string };
const vEmpty: VForm = { name: "", sku: "", stock: "0", min_stock: "0", extra_cost: "0", extra_price: "0" };

function VariantsDialog({ open, product, onClose }: { open: boolean; product: { id: string; name: string } | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<VForm>(vEmpty);

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
            <TableHeader><TableRow><TableHead>Variação</TableHead><TableHead>SKU</TableHead><TableHead>Estoque</TableHead><TableHead>Ajuste preço</TableHead><TableHead></TableHead></TableRow></TableHeader>
            <TableBody>
              {(variants ?? []).length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6 text-sm">Nenhuma variação ainda.</TableCell></TableRow>}
              {(variants ?? []).map((v: any) => {
                const low = v.stock <= v.min_stock;
                return (
                  <TableRow key={v.id}>
                    <TableCell className="font-medium">{v.name}</TableCell>
                    <TableCell className="font-mono text-xs">{v.sku ?? "—"}</TableCell>
                    <TableCell><Badge variant={low ? "destructive" : "secondary"} className="font-mono">{v.stock}</Badge></TableCell>
                    <TableCell className="text-sm">{Number(v.extra_price) ? `+${brl(v.extra_price)}` : "—"}</TableCell>
                    <TableCell className="text-right"><button onClick={() => remove.mutate(v.id)}><Trash2 className="h-4 w-4 text-destructive" /></button></TableCell>
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
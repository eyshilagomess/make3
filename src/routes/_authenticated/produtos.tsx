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
import { Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { brl } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/produtos")({
  head: () => ({ meta: [{ title: "Produtos — Make 3" }] }),
  component: Page,
});

type Form = {
  name: string; sku: string; category: string; brand: string; supplier_id: string;
  photo_url: string; cost: string; price: string; stock: string; min_stock: string;
};
const empty: Form = { name: "", sku: "", category: "", brand: "", supplier_id: "", photo_url: "", cost: "0", price: "0", stock: "0", min_stock: "0" };

function Page() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Form>(empty);
  const [search, setSearch] = useState("");

  const { data } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("*, suppliers(name)").order("name");
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
        stock: Number(f.stock || 0), min_stock: Number(f.min_stock || 0),
      };
      const { data: p, error } = await supabase.from("products").insert(payload).select("id").single();
      if (error) throw error;
      if (Number(f.stock) > 0) {
        await supabase.from("stock_movements").insert({
          product_id: p.id, movement_type: "entrada", quantity: Number(f.stock), reason: "Estoque inicial",
        });
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["products"] }); toast.success("Produto cadastrado!"); setOpen(false); setForm(empty); },
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
                <div className="space-y-1.5"><Label>Estoque inicial</Label><Input type="number" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>Estoque mínimo</Label><Input type="number" value={form.min_stock} onChange={(e) => setForm({ ...form, min_stock: e.target.value })} /></div>
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
          <TableHeader><TableRow><TableHead>Produto</TableHead><TableHead>SKU</TableHead><TableHead>Marca</TableHead><TableHead>Custo</TableHead><TableHead>Preço</TableHead><TableHead>Estoque</TableHead></TableRow></TableHeader>
          <TableBody>
            {filtered.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-12">Nenhum produto cadastrado.</TableCell></TableRow>}
            {filtered.map((p: any) => {
              const low = p.stock <= p.min_stock;
              return (
                <TableRow key={p.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      {p.photo_url ? <img src={p.photo_url} alt="" className="h-9 w-9 rounded-md object-cover" /> : <div className="h-9 w-9 rounded-md bg-muted" />}
                      <div>
                        <div className="font-medium">{p.name}</div>
                        <div className="text-xs text-muted-foreground">{p.category ?? ""} {p.suppliers?.name ? `· ${p.suppliers.name}` : ""}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{p.sku ?? "—"}</TableCell>
                  <TableCell>{p.brand ?? "—"}</TableCell>
                  <TableCell>{brl(p.cost)}</TableCell>
                  <TableCell className="font-semibold">{brl(p.price)}</TableCell>
                  <TableCell>
                    <Badge variant={low ? "destructive" : "secondary"} className="font-mono">{p.stock}{low ? ` / mín ${p.min_stock}` : ""}</Badge>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
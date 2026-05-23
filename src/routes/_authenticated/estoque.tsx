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
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { dateTimeBR, MOVEMENT_TYPES, movementTypeLabel } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/estoque")({
  head: () => ({ meta: [{ title: "Movimentações — Make 3" }] }),
  component: Page,
});

const POSITIVE = new Set(["entrada", "devolucao"]);

function Page() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [productId, setProductId] = useState("");
  const [type, setType] = useState("entrada");
  const [quantity, setQuantity] = useState("1");
  const [reason, setReason] = useState("");

  const { data: movements } = useQuery({
    queryKey: ["movements"],
    queryFn: async () => {
      const { data, error } = await supabase.from("stock_movements").select("*, products(name, sku)").order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      return data;
    },
  });
  const { data: products } = useQuery({
    queryKey: ["products-min"],
    queryFn: async () => (await supabase.from("products").select("id,name,stock").order("name")).data ?? [],
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!productId) throw new Error("Selecione um produto");
      const qty = Number(quantity);
      if (!qty || qty <= 0) throw new Error("Quantidade inválida");
      const product = (products ?? []).find((p: any) => p.id === productId);
      const delta = POSITIVE.has(type) ? qty : -qty;
      const newStock = (product?.stock ?? 0) + delta;
      if (newStock < 0) throw new Error("Estoque insuficiente");
      const { error: e1 } = await supabase.from("stock_movements").insert({
        product_id: productId, movement_type: type as any, quantity: qty, reason,
      });
      if (e1) throw e1;
      const { error: e2 } = await supabase.from("products").update({ stock: newStock }).eq("id", productId);
      if (e2) throw e2;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["movements"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["products-min"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success("Movimentação registrada!");
      setOpen(false); setProductId(""); setType("entrada"); setQuantity("1"); setReason("");
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <PageHeader title="Movimentações de estoque" subtitle="Entradas, saídas e ajustes operacionais"
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button className="bg-gradient-brand text-primary-foreground border-0 shadow-glow"><Plus className="h-4 w-4 mr-1" /> Nova movimentação</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Nova movimentação</DialogTitle></DialogHeader>
              <form onSubmit={(e) => { e.preventDefault(); create.mutate(); }} className="space-y-3">
                <div className="space-y-1.5"><Label>Produto *</Label>
                  <Select value={productId} onValueChange={setProductId}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>{(products ?? []).map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name} (estoque: {p.stock})</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5"><Label>Tipo *</Label>
                    <Select value={type} onValueChange={setType}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{MOVEMENT_TYPES.map((t) => <SelectItem key={t} value={t}>{movementTypeLabel(t)}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5"><Label>Quantidade *</Label><Input type="number" min={1} value={quantity} onChange={(e) => setQuantity(e.target.value)} /></div>
                </div>
                <div className="space-y-1.5"><Label>Motivo / observação</Label><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex: compra do fornecedor X" /></div>
                <div className="flex justify-end gap-2 mt-2">
                  <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
                  <Button type="submit" disabled={create.isPending} className="bg-gradient-brand text-primary-foreground border-0">{create.isPending ? "Salvando…" : "Registrar"}</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      <Card className="p-4 shadow-card">
        <Table>
          <TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Produto</TableHead><TableHead>Tipo</TableHead><TableHead>Quantidade</TableHead><TableHead>Motivo</TableHead></TableRow></TableHeader>
          <TableBody>
            {(movements ?? []).length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-12">Nenhuma movimentação ainda.</TableCell></TableRow>}
            {(movements ?? []).map((m: any) => {
              const positive = POSITIVE.has(m.movement_type);
              return (
                <TableRow key={m.id}>
                  <TableCell className="text-sm">{dateTimeBR(m.created_at)}</TableCell>
                  <TableCell className="font-medium">{m.products?.name ?? "—"}</TableCell>
                  <TableCell><Badge variant={positive ? "secondary" : "outline"}>{movementTypeLabel(m.movement_type)}</Badge></TableCell>
                  <TableCell className={`font-mono ${positive ? "text-success" : "text-destructive"}`}>{positive ? "+" : "−"}{m.quantity}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{m.reason ?? "—"}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
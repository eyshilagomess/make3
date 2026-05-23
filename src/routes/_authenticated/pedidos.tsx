import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  brl, dateTimeBR,
  CHANNELS, PAYMENT_METHODS, PAYMENT_STATUSES, ORDER_STATUSES,
  channelLabel, paymentMethodLabel, paymentStatusLabel, orderStatusLabel,
} from "@/lib/format";

export const Route = createFileRoute("/_authenticated/pedidos")({
  head: () => ({ meta: [{ title: "Pedidos — Make 3" }] }),
  component: Page,
});

type Item = { product_id: string; product_name: string; variant_id: string | null; variant_name: string | null; quantity: number; unit_price: number; unit_cost: number };

function Page() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [customerId, setCustomerId] = useState<string>("");
  const [channel, setChannel] = useState<string>("presencial");
  const [paymentMethod, setPaymentMethod] = useState<string>("pix");
  const [paymentStatus, setPaymentStatus] = useState<string>("confirmado");
  const [status, setStatus] = useState<string>("pendente");
  const [discount, setDiscount] = useState("0");
  const [shipping, setShipping] = useState("0");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [selProduct, setSelProduct] = useState("");
  const [selVariant, setSelVariant] = useState("");
  const [selQty, setSelQty] = useState("1");

  const { data: orders } = useQuery({
    queryKey: ["orders"],
    queryFn: async () => {
      const { data, error } = await supabase.from("orders").select("*, customers(name), order_items(id)").order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      return data;
    },
  });
  const { data: customers } = useQuery({ queryKey: ["customers-min"], queryFn: async () => (await supabase.from("customers").select("id,name").order("name")).data ?? [] });
  const { data: products } = useQuery({ queryKey: ["products-min-orders"], queryFn: async () => (await supabase.from("products").select("id,name,price,price_site,price_shopee,price_tiktok,cost,stock,has_variants").order("name")).data ?? [] });
  const { data: selVariants } = useQuery({
    enabled: !!selProduct,
    queryKey: ["variants-for-order", selProduct],
    queryFn: async () => (await supabase.from("product_variants").select("id,name,stock,extra_cost,extra_price").eq("product_id", selProduct).order("name")).data ?? [],
  });
  const selProductObj = (products ?? []).find((p: any) => p.id === selProduct);

  const priceForChannel = (prod: any, ch: string): number => {
    if (ch === "shopee") return Number(prod.price_shopee ?? prod.price ?? 0);
    if (ch === "tiktok_shop") return Number(prod.price_tiktok ?? prod.price ?? 0);
    // presencial, site, instagram, whatsapp, woocommerce, outros → preço do site
    return Number(prod.price_site ?? prod.price ?? 0);
  };

  const subtotal = useMemo(() => items.reduce((s, i) => s + i.quantity * i.unit_price, 0), [items]);
  const total = Math.max(0, subtotal - Number(discount || 0) + Number(shipping || 0));

  const addItem = () => {
    const prod = (products ?? []).find((p: any) => p.id === selProduct);
    if (!prod) return toast.error("Selecione um produto");
    const qty = Number(selQty);
    if (!qty || qty <= 0) return toast.error("Quantidade inválida");
    let variant_id: string | null = null;
    let variant_name: string | null = null;
    let unit_price = priceForChannel(prod, channel);
    let unit_cost = Number(prod.cost);
    if (prod.has_variants) {
      if (!selVariant) return toast.error("Selecione a variação");
      const v = (selVariants ?? []).find((x: any) => x.id === selVariant);
      if (!v) return toast.error("Variação não encontrada");
      variant_id = v.id;
      variant_name = v.name;
      unit_price += Number(v.extra_price || 0);
      unit_cost += Number(v.extra_cost || 0);
    }
    setItems([...items, { product_id: prod.id, product_name: prod.name, variant_id, variant_name, quantity: qty, unit_price, unit_cost }]);
    setSelProduct(""); setSelVariant(""); setSelQty("1");
  };

  const reset = () => {
    setCustomerId(""); setChannel("presencial"); setPaymentMethod("pix");
    setPaymentStatus("confirmado"); setStatus("pendente");
    setDiscount("0"); setShipping("0"); setNotes(""); setItems([]);
  };

  const create = useMutation({
    mutationFn: async () => {
      if (items.length === 0) throw new Error("Adicione pelo menos 1 produto");
      const { data: order, error } = await supabase.from("orders").insert({
        customer_id: customerId || null,
        channel: channel as any,
        seller_id: user?.id,
        payment_method: paymentMethod as any,
        payment_status: paymentStatus as any,
        status: status as any,
        subtotal, discount: Number(discount || 0), shipping: Number(shipping || 0), total,
        notes: notes || null,
      }).select("id").single();
      if (error) throw error;

      const itemsPayload = items.map((i) => ({
        order_id: order.id, product_id: i.product_id, product_name: i.product_name,
        variant_id: i.variant_id, variant_name: i.variant_name,
        quantity: i.quantity, unit_price: i.unit_price, unit_cost: i.unit_cost,
        subtotal: i.quantity * i.unit_price,
      }));
      const { error: e2 } = await supabase.from("order_items").insert(itemsPayload);
      if (e2) throw e2;

      // Stock movements + decrement stock
      for (const i of items) {
        await supabase.from("stock_movements").insert({
          product_id: i.product_id, variant_id: i.variant_id, movement_type: "saida", quantity: i.quantity,
          reason: `Pedido`, reference_order_id: order.id,
        });
        if (i.variant_id) {
          const { data: v } = await supabase.from("product_variants").select("stock").eq("id", i.variant_id).single();
          await supabase.from("product_variants").update({ stock: Math.max(0, (v?.stock ?? 0) - i.quantity) }).eq("id", i.variant_id);
        } else {
          const prod = (products ?? []).find((p: any) => p.id === i.product_id);
          if (prod) {
            await supabase.from("products").update({ stock: Math.max(0, prod.stock - i.quantity) }).eq("id", i.product_id);
          }
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success("Pedido registrado!");
      setOpen(false); reset();
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <PageHeader title="Pedidos" subtitle="Cadastro e acompanhamento de vendas"
        actions={
          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
            <DialogTrigger asChild><Button className="bg-gradient-brand text-primary-foreground border-0 shadow-glow"><Plus className="h-4 w-4 mr-1" /> Novo pedido</Button></DialogTrigger>
            <DialogContent className="max-w-3xl">
              <DialogHeader><DialogTitle>Novo pedido</DialogTitle></DialogHeader>
              <div className="grid grid-cols-2 gap-3 max-h-[75vh] overflow-y-auto pr-2">
                <div className="space-y-1.5"><Label>Cliente</Label>
                  <Select value={customerId} onValueChange={setCustomerId}>
                    <SelectTrigger><SelectValue placeholder="Cliente avulso" /></SelectTrigger>
                    <SelectContent>{(customers ?? []).map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5"><Label>Canal *</Label>
                  <Select value={channel} onValueChange={setChannel}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{CHANNELS.map((c) => <SelectItem key={c} value={c}>{channelLabel(c)}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5"><Label>Forma de pagamento</Label>
                  <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{PAYMENT_METHODS.map((c) => <SelectItem key={c} value={c}>{paymentMethodLabel(c)}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5"><Label>Status pagamento</Label>
                  <Select value={paymentStatus} onValueChange={setPaymentStatus}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{PAYMENT_STATUSES.map((c) => <SelectItem key={c} value={c}>{paymentStatusLabel(c)}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5 col-span-2"><Label>Status do pedido</Label>
                  <Select value={status} onValueChange={setStatus}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{ORDER_STATUSES.map((c) => <SelectItem key={c} value={c}>{orderStatusLabel(c)}</SelectItem>)}</SelectContent>
                  </Select>
                </div>

                <div className="col-span-2 border border-border rounded-lg p-3">
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">Produtos</Label>
                  <div className="flex gap-2 mt-2">
                    <Select value={selProduct} onValueChange={(v) => { setSelProduct(v); setSelVariant(""); }}>
                      <SelectTrigger className="flex-1"><SelectValue placeholder="Selecione um produto" /></SelectTrigger>
                      <SelectContent>{(products ?? []).map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name} — {brl(p.price)}{p.has_variants ? " (c/ variações)" : ` (est: ${p.stock})`}</SelectItem>)}</SelectContent>
                    </Select>
                    <Input type="number" min={1} value={selQty} onChange={(e) => setSelQty(e.target.value)} className="w-20" />
                    <Button type="button" onClick={addItem}><Plus className="h-4 w-4" /></Button>
                  </div>
                  {selProductObj?.has_variants && (
                    <div className="mt-2">
                      <Select value={selVariant} onValueChange={setSelVariant}>
                        <SelectTrigger><SelectValue placeholder="Selecione a variação" /></SelectTrigger>
                        <SelectContent>{(selVariants ?? []).map((v: any) => <SelectItem key={v.id} value={v.id}>{v.name} (est: {v.stock}){Number(v.extra_price) ? ` · +${brl(v.extra_price)}` : ""}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  )}
                  <div className="mt-3 space-y-1">
                    {items.length === 0 && <p className="text-xs text-muted-foreground py-2">Nenhum item.</p>}
                    {items.map((i, idx) => (
                      <div key={idx} className="flex items-center justify-between text-sm bg-muted/40 rounded p-2">
                        <span>{i.quantity}× {i.product_name}{i.variant_name ? ` — ${i.variant_name}` : ""}</span>
                        <div className="flex items-center gap-3">
                          <span className="font-semibold">{brl(i.quantity * i.unit_price)}</span>
                          <button type="button" onClick={() => setItems(items.filter((_, j) => j !== idx))}><Trash2 className="h-3.5 w-3.5 text-destructive" /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5"><Label>Desconto (R$)</Label><Input type="number" step="0.01" value={discount} onChange={(e) => setDiscount(e.target.value)} /></div>
                <div className="space-y-1.5"><Label>Frete (R$)</Label><Input type="number" step="0.01" value={shipping} onChange={(e) => setShipping(e.target.value)} /></div>
                <div className="col-span-2 space-y-1.5"><Label>Observações</Label><Input value={notes} onChange={(e) => setNotes(e.target.value)} /></div>

                <div className="col-span-2 flex items-center justify-between bg-muted/50 rounded-lg p-3">
                  <span className="text-sm text-muted-foreground">Subtotal: {brl(subtotal)}</span>
                  <span className="text-2xl font-bold text-gradient-brand">{brl(total)}</span>
                </div>

                <div className="col-span-2 flex justify-end gap-2">
                  <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
                  <Button type="button" disabled={create.isPending} onClick={() => create.mutate()} className="bg-gradient-brand text-primary-foreground border-0">{create.isPending ? "Salvando…" : "Registrar pedido"}</Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        }
      />

      <Card className="p-4 shadow-card">
        <Table>
          <TableHeader><TableRow><TableHead>Código</TableHead><TableHead>Cliente</TableHead><TableHead>Canal</TableHead><TableHead>Pagamento</TableHead><TableHead>Status</TableHead><TableHead>Data</TableHead><TableHead className="text-right">Total</TableHead></TableRow></TableHeader>
          <TableBody>
            {(orders ?? []).length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-12">Nenhum pedido ainda.</TableCell></TableRow>}
            {(orders ?? []).map((o: any) => (
              <TableRow key={o.id}>
                <TableCell className="font-mono text-xs">{o.order_code}</TableCell>
                <TableCell className="font-medium">{o.customers?.name ?? "Cliente avulso"}</TableCell>
                <TableCell><Badge variant="outline">{channelLabel(o.channel)}</Badge></TableCell>
                <TableCell className="text-sm">{paymentMethodLabel(o.payment_method)}<br /><span className="text-xs text-muted-foreground">{paymentStatusLabel(o.payment_status)}</span></TableCell>
                <TableCell><Badge variant="secondary">{orderStatusLabel(o.status)}</Badge></TableCell>
                <TableCell className="text-sm">{dateTimeBR(o.created_at)}</TableCell>
                <TableCell className="text-right font-semibold">{brl(o.total)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
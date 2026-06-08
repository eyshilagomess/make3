import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2, Download, Upload, Pencil, Eye, FileText, Search } from "lucide-react";
import { toast } from "sonner";
import { downloadXLSX, parseSpreadsheet } from "@/lib/export";
import {
  brl, dateTimeBR,
  CHANNELS, PAYMENT_METHODS, PAYMENT_STATUSES, ORDER_STATUSES,
  channelLabel, paymentMethodLabel, paymentStatusLabel, orderStatusLabel,
} from "@/lib/format";
import { DateRangeFilter } from "@/components/DateRangeFilter";
import { rangeFromPreset, DEFAULT_PRESET, toISO, endExclusiveISO, type DateRange } from "@/lib/date-range";

export const Route = createFileRoute("/_authenticated/pedidos")({
  head: () => ({ meta: [{ title: "Pedidos — Make 3" }] }),
  component: Page,
});

type Item = { product_id: string; product_name: string; variant_id: string | null; variant_name: string | null; quantity: number; unit_price: number; unit_cost: number };

type FormState = {
  customerId: string;
  customerNameFreeform: string;
  channel: string;
  paymentMethod: string;
  paymentMethod2: string;
  paymentAmount1: string;
  paymentAmount2: string;
  paymentStatus: string;
  status: string;
  discount: string;
  shipping: string;
  notes: string;
  items: Item[];
  paymentProofUrl: string;
};

const emptyForm: FormState = {
  customerId: "", customerNameFreeform: "", channel: "presencial",
  paymentMethod: "pix", paymentMethod2: "none", paymentAmount1: "", paymentAmount2: "",
  paymentStatus: "confirmado", status: "pendente",
  discount: "0", shipping: "0", notes: "", items: [], paymentProofUrl: "",
};

function Page() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [range, setRange] = useState<DateRange>(() => rangeFromPreset(DEFAULT_PRESET));
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [productQuery, setProductQuery] = useState("");
  const [selProduct, setSelProduct] = useState("");
  const [selVariant, setSelVariant] = useState("");
  const [selQty, setSelQty] = useState("1");
  const fileRef = useRef<HTMLInputElement>(null);
  const proofRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const { data: orders } = useQuery({
    queryKey: ["orders", toISO(range.start), endExclusiveISO(range.end)],
    queryFn: async () => {
      const { data, error } = await supabase.from("orders").select("*, customers(name), order_items(id)")
        .gte("created_at", toISO(range.start)).lt("created_at", endExclusiveISO(range.end))
        .order("created_at", { ascending: false }).limit(500);
      if (error) throw error;
      return data;
    },
  });
  const { data: customers } = useQuery({ queryKey: ["customers-min"], queryFn: async () => (await supabase.from("customers").select("id,name").order("name")).data ?? [] });
  const { data: products } = useQuery({ queryKey: ["products-min-orders"], queryFn: async () => (await supabase.from("products").select("id,name,price,price_site,price_shopee,price_tiktok,cost,stock,has_variants,sku").order("name")).data ?? [] });
  const { data: selVariants } = useQuery({
    enabled: !!selProduct,
    queryKey: ["variants-for-order", selProduct],
    queryFn: async () => (await supabase.from("product_variants").select("id,name,stock,extra_cost,extra_price").eq("product_id", selProduct).order("name")).data ?? [],
  });
  const selProductObj = (products ?? []).find((p: any) => p.id === selProduct);

  const priceForChannel = (prod: any, ch: string): number => {
    if (ch === "shopee") return Number(prod.price_shopee ?? prod.price ?? 0);
    if (ch === "tiktok_shop") return Number(prod.price_tiktok ?? prod.price ?? 0);
    return Number(prod.price_site ?? prod.price ?? 0);
  };

  const subtotal = useMemo(() => form.items.reduce((s, i) => s + i.quantity * i.unit_price, 0), [form.items]);
  const total = Math.max(0, subtotal - Number(form.discount || 0) + Number(form.shipping || 0));

  const filteredProducts = useMemo(() => {
    const q = productQuery.trim().toLowerCase();
    const list = products ?? [];
    if (!q) return list.slice(0, 15);
    return list.filter((p: any) =>
      p.name?.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q)
    ).slice(0, 30);
  }, [products, productQuery]);

  const addItem = () => {
    const prod = (products ?? []).find((p: any) => p.id === selProduct);
    if (!prod) return toast.error("Selecione um produto");
    const qty = Number(selQty);
    if (!qty || qty <= 0) return toast.error("Quantidade inválida");
    let variant_id: string | null = null;
    let variant_name: string | null = null;
    let unit_price = priceForChannel(prod, form.channel);
    let unit_cost = Number(prod.cost);
    if (prod.has_variants) {
      if (!selVariant) return toast.error("Selecione a variação");
      const v = (selVariants ?? []).find((x: any) => x.id === selVariant);
      if (!v) return toast.error("Variação não encontrada");
      variant_id = v.id; variant_name = v.name;
      unit_price += Number(v.extra_price || 0);
      unit_cost += Number(v.extra_cost || 0);
    }
    setForm({ ...form, items: [...form.items, { product_id: prod.id, product_name: prod.name, variant_id, variant_name, quantity: qty, unit_price, unit_cost }] });
    setSelProduct(""); setSelVariant(""); setSelQty("1"); setProductQuery("");
  };

  const reset = () => { setForm(emptyForm); setEditingId(null); setProductQuery(""); setSelProduct(""); setSelVariant(""); setSelQty("1"); };

  const openProof = async (ref: string) => {
    if (!ref) return;
    if (/^https?:\/\//i.test(ref)) { window.open(ref, "_blank", "noopener,noreferrer"); return; }
    const { data, error } = await supabase.storage.from("payment-proofs").createSignedUrl(ref, 60);
    if (error || !data?.signedUrl) { toast.error("Não foi possível abrir o comprovante"); return; }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  const uploadProof = async (file: File) => {
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "bin";
      const path = `${user?.id || "anon"}/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("payment-proofs").upload(path, file, { upsert: false });
      if (error) throw error;
      // Store the storage path; we generate short-lived signed URLs on demand.
      setForm((f) => ({ ...f, paymentProofUrl: path }));
      toast.success("Comprovante anexado");
    } catch (e: any) { toast.error(e.message); }
    finally { setUploading(false); }
  };

  const buildOrderPayload = () => ({
    customer_id: form.customerId || null,
    customer_name_freeform: form.customerId ? null : (form.customerNameFreeform || null),
    channel: form.channel as any,
    payment_method: form.paymentMethod as any,
    payment_method_2: form.paymentMethod2 && form.paymentMethod2 !== "none" ? form.paymentMethod2 as any : null,
    payment_amount_1: form.paymentMethod2 && form.paymentMethod2 !== "none" ? Number(form.paymentAmount1 || 0) : null,
    payment_amount_2: form.paymentMethod2 && form.paymentMethod2 !== "none" ? Number(form.paymentAmount2 || 0) : null,
    payment_status: form.paymentStatus as any,
    status: form.status as any,
    subtotal, discount: Number(form.discount || 0), shipping: Number(form.shipping || 0), total,
    notes: form.notes || null,
    payment_proof_url: form.paymentProofUrl || null,
  });

  const create = useMutation({
    mutationFn: async () => {
      if (form.items.length === 0) throw new Error("Adicione pelo menos 1 produto");
      const payload: any = { ...buildOrderPayload(), seller_id: user?.id };
      const { data: order, error } = await supabase.from("orders").insert(payload).select("id").single();
      if (error) throw error;
      const itemsPayload = form.items.map((i) => ({
        order_id: order.id, product_id: i.product_id, product_name: i.product_name,
        variant_id: i.variant_id, variant_name: i.variant_name,
        quantity: i.quantity, unit_price: i.unit_price, unit_cost: i.unit_cost,
        subtotal: i.quantity * i.unit_price,
      }));
      const { error: e2 } = await supabase.from("order_items").insert(itemsPayload);
      if (e2) throw e2;
      for (const i of form.items) {
        await supabase.from("stock_movements").insert({
          product_id: i.product_id, variant_id: i.variant_id, movement_type: "saida", quantity: i.quantity,
          reason: "Pedido", reference_order_id: order.id,
        });
        if (i.variant_id) {
          const { data: v } = await supabase.from("product_variants").select("stock").eq("id", i.variant_id).single();
          await supabase.from("product_variants").update({ stock: Math.max(0, (v?.stock ?? 0) - i.quantity) }).eq("id", i.variant_id);
        } else {
          const prod = (products ?? []).find((p: any) => p.id === i.product_id);
          if (prod) await supabase.from("products").update({ stock: Math.max(0, prod.stock - i.quantity) }).eq("id", i.product_id);
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      toast.success("Pedido registrado!");
      setOpen(false); reset();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const update = useMutation({
    mutationFn: async () => {
      if (!editingId) return;
      const { error } = await supabase.from("orders").update(buildOrderPayload()).eq("id", editingId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success("Pedido atualizado!");
      setOpen(false); reset();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      // Restaurar estoque
      const { data: its } = await supabase.from("order_items").select("product_id,variant_id,quantity").eq("order_id", id);
      for (const it of its ?? []) {
        if (it.variant_id) {
          const { data: v } = await supabase.from("product_variants").select("stock").eq("id", it.variant_id).single();
          await supabase.from("product_variants").update({ stock: (v?.stock ?? 0) + it.quantity }).eq("id", it.variant_id);
        } else if (it.product_id) {
          const { data: p } = await supabase.from("products").select("stock").eq("id", it.product_id).single();
          await supabase.from("products").update({ stock: (p?.stock ?? 0) + it.quantity }).eq("id", it.product_id);
        }
        await supabase.from("stock_movements").insert({
          product_id: it.product_id!, variant_id: it.variant_id, movement_type: "devolucao",
          quantity: it.quantity, reason: "Exclusão de pedido", reference_order_id: id,
        });
      }
      await supabase.from("order_items").delete().eq("order_id", id);
      const { error } = await supabase.from("orders").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      toast.success("Pedido excluído");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const openEdit = async (o: any) => {
    const { data: its } = await supabase.from("order_items").select("*").eq("order_id", o.id);
    setEditingId(o.id);
    setForm({
      customerId: o.customer_id ?? "",
      customerNameFreeform: o.customer_name_freeform ?? "",
      channel: o.channel ?? "presencial",
      paymentMethod: o.payment_method ?? "pix",
      paymentMethod2: o.payment_method_2 ?? "none",
      paymentAmount1: o.payment_amount_1 != null ? String(o.payment_amount_1) : "",
      paymentAmount2: o.payment_amount_2 != null ? String(o.payment_amount_2) : "",
      paymentStatus: o.payment_status ?? "confirmado",
      status: o.status ?? "pendente",
      discount: String(o.discount ?? 0),
      shipping: String(o.shipping ?? 0),
      notes: o.notes ?? "",
      paymentProofUrl: o.payment_proof_url ?? "",
      items: (its ?? []).map((i: any) => ({
        product_id: i.product_id, product_name: i.product_name,
        variant_id: i.variant_id, variant_name: i.variant_name,
        quantity: i.quantity, unit_price: Number(i.unit_price), unit_cost: Number(i.unit_cost),
      })),
    });
    setOpen(true);
  };

  const exportOrders = () => {
    const rows = (orders ?? []).map((o: any) => ({
      Código: o.order_code,
      Cliente: o.customers?.name ?? o.customer_name_freeform ?? "Cliente avulso",
      Canal: channelLabel(o.channel),
      "Forma pagamento": paymentMethodLabel(o.payment_method),
      "2ª forma": o.payment_method_2 ? paymentMethodLabel(o.payment_method_2) : "",
      "Status pagamento": paymentStatusLabel(o.payment_status),
      Status: orderStatusLabel(o.status),
      Subtotal: Number(o.subtotal ?? 0),
      Desconto: Number(o.discount ?? 0),
      Frete: Number(o.shipping ?? 0),
      Total: Number(o.total ?? 0),
      Observações: o.notes ?? "",
      Data: o.created_at,
    }));
    downloadXLSX(`pedidos-${new Date().toISOString().slice(0, 10)}.xlsx`, { Pedidos: rows });
  };

  const importOrders = useMutation({
    mutationFn: async (file: File) => {
      const rows = await parseSpreadsheet(file);
      if (rows.length === 0) throw new Error("Planilha vazia");
      const channelMap: Record<string, string> = { presencial: "presencial", site: "site", instagram: "instagram", shopee: "shopee", "tiktok shop": "tiktok_shop", tiktok: "tiktok_shop", woocommerce: "woocommerce", whatsapp: "whatsapp", outros: "outros" };
      const norm = (v: any) => String(v ?? "").trim().toLowerCase();
      let ok = 0;
      for (const r of rows) {
        const total = Number(r["Total"] ?? r["total"] ?? 0);
        if (!total) continue;
        const channel = channelMap[norm(r["Canal"] ?? r["canal"])] ?? "outros";
        const { error } = await supabase.from("orders").insert({
          channel: channel as any, seller_id: user?.id,
          payment_method: "outros" as any, payment_status: "confirmado" as any, status: "entregue" as any,
          subtotal: Number(r["Subtotal"] ?? total), discount: Number(r["Desconto"] ?? 0),
          shipping: Number(r["Frete"] ?? 0), total,
          notes: r["Observações"] ?? null, external_reference: r["Código"] ?? null,
          customer_name_freeform: r["Cliente"] ?? null,
        });
        if (!error) ok++;
      }
      return ok;
    },
    onSuccess: (n) => {
      toast.success(`${n} pedidos importados`);
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["vendas"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const detailsOrder = (orders ?? []).find((o: any) => o.id === detailsId);

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-7xl mx-auto">
      <PageHeader title="Pedidos" subtitle={`Cadastro e acompanhamento — ${range.label}`}
        actions={
          <div className="flex items-center gap-2">
            <DateRangeFilter value={range} onChange={setRange} />
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) importOrders.mutate(f); e.target.value = ""; }} />
            <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={importOrders.isPending}><Upload className="h-4 w-4 mr-1" /> Importar</Button>
            <Button variant="outline" onClick={exportOrders}><Download className="h-4 w-4 mr-1" /> Baixar</Button>
            <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
              <DialogTrigger asChild><Button className="bg-gradient-brand text-primary-foreground border-0 shadow-glow" onClick={() => { reset(); setOpen(true); }}><Plus className="h-4 w-4 mr-1" /> Novo pedido</Button></DialogTrigger>
              <DialogContent className="max-w-3xl">
                <DialogHeader><DialogTitle>{editingId ? "Editar pedido" : "Novo pedido"}</DialogTitle></DialogHeader>
                <div className="grid grid-cols-2 gap-3 max-h-[75vh] overflow-y-auto pr-2">
                  <div className="space-y-1.5"><Label>Cliente cadastrada</Label>
                    <Select value={form.customerId || "none"} onValueChange={(v) => setForm({ ...form, customerId: v === "none" ? "" : v })}>
                      <SelectTrigger><SelectValue placeholder="Cliente avulso" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Cliente avulso (digitar nome)</SelectItem>
                        {(customers ?? []).map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5"><Label>Nome do cliente avulso</Label>
                    <Input placeholder="Ex: Maria Silva (Instagram)" value={form.customerNameFreeform} disabled={!!form.customerId}
                      onChange={(e) => setForm({ ...form, customerNameFreeform: e.target.value })} />
                  </div>

                  <div className="space-y-1.5"><Label>Canal *</Label>
                    <Select value={form.channel} onValueChange={(v) => {
                      setForm((f) => ({
                        ...f, channel: v,
                        items: f.items.map((it) => {
                          const prod = (products ?? []).find((p: any) => p.id === it.product_id);
                          if (!prod) return it;
                          let unit_price = priceForChannel(prod, v);
                          if (it.variant_id) unit_price += Math.max(0, it.unit_price - Number(prod.price_site ?? prod.price ?? 0));
                          return { ...it, unit_price };
                        }),
                      }));
                    }}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{CHANNELS.map((c) => <SelectItem key={c} value={c}>{channelLabel(c)}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5"><Label>Status do pedido</Label>
                    <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{ORDER_STATUSES.map((c) => <SelectItem key={c} value={c}>{orderStatusLabel(c)}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5"><Label>Forma de pagamento *</Label>
                    <Select value={form.paymentMethod} onValueChange={(v) => setForm({ ...form, paymentMethod: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{PAYMENT_METHODS.map((c) => <SelectItem key={c} value={c}>{paymentMethodLabel(c)}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5"><Label>2ª forma (opcional)</Label>
                    <Select value={form.paymentMethod2} onValueChange={(v) => setForm({ ...form, paymentMethod2: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">— nenhuma —</SelectItem>
                        {PAYMENT_METHODS.map((c) => <SelectItem key={c} value={c}>{paymentMethodLabel(c)}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>

                  {form.paymentMethod2 !== "none" && (
                    <>
                      <div className="space-y-1.5"><Label>Valor 1ª forma (R$)</Label>
                        <Input type="number" step="0.01" value={form.paymentAmount1} onChange={(e) => {
                          const v = e.target.value;
                          const rem = total - Number(v || 0);
                          setForm({ ...form, paymentAmount1: v, paymentAmount2: rem > 0 ? String(Math.round(rem * 100) / 100) : "0" });
                        }} placeholder="0,00" />
                      </div>
                      <div className="space-y-1.5"><Label>Valor 2ª forma (R$)</Label>
                        <Input type="number" step="0.01" value={form.paymentAmount2} onChange={(e) => setForm({ ...form, paymentAmount2: e.target.value })} placeholder="0,00" />
                      </div>
                    </>
                  )}

                  <div className="space-y-1.5"><Label>Status pagamento</Label>
                    <Select value={form.paymentStatus} onValueChange={(v) => setForm({ ...form, paymentStatus: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{PAYMENT_STATUSES.map((c) => <SelectItem key={c} value={c}>{paymentStatusLabel(c)}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5"><Label>Comprovante</Label>
                    <input ref={proofRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadProof(f); e.target.value = ""; }} />
                    <div className="flex gap-2">
                      <Button type="button" variant="outline" size="sm" disabled={uploading} onClick={() => proofRef.current?.click()}>
                        <Upload className="h-3.5 w-3.5 mr-1" /> {uploading ? "Enviando…" : form.paymentProofUrl ? "Substituir" : "Anexar"}
                      </Button>
                      {form.paymentProofUrl && <button type="button" onClick={() => openProof(form.paymentProofUrl)} className="text-xs text-primary underline self-center">Ver arquivo</button>}
                    </div>
                  </div>

                  <div className="col-span-2 border border-border rounded-lg p-3">
                    <Label className="text-xs uppercase tracking-wide text-muted-foreground">Produtos</Label>
                    <div className="relative mt-2">
                      <Search className="h-3.5 w-3.5 absolute left-2 top-2.5 text-muted-foreground" />
                      <Input className="pl-7" placeholder="Buscar produto por nome ou SKU…" value={productQuery} onChange={(e) => { setProductQuery(e.target.value); setSelProduct(""); setSelVariant(""); }} />
                    </div>
                    {productQuery && !selProduct && (
                      <div className="mt-2 border border-border rounded-md max-h-44 overflow-y-auto bg-background">
                        {filteredProducts.length === 0 && <p className="text-xs text-muted-foreground p-2">Nenhum produto encontrado.</p>}
                        {filteredProducts.map((p: any) => (
                          <button type="button" key={p.id} onClick={() => { setSelProduct(p.id); setProductQuery(p.name); }}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-muted/60 flex items-center justify-between border-b border-border last:border-0">
                            <span>{p.name}{p.sku ? <span className="text-xs text-muted-foreground ml-2">{p.sku}</span> : null}</span>
                            <span className="text-xs text-muted-foreground">{brl(priceForChannel(p, form.channel))} · {p.has_variants ? "var." : `est ${p.stock}`}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    {selProduct && selProductObj?.has_variants && (
                      <div className="mt-2">
                        <Select value={selVariant} onValueChange={setSelVariant}>
                          <SelectTrigger><SelectValue placeholder="Selecione a variação" /></SelectTrigger>
                          <SelectContent>{(selVariants ?? []).map((v: any) => <SelectItem key={v.id} value={v.id}>{v.name} (est: {v.stock}){Number(v.extra_price) ? ` · +${brl(v.extra_price)}` : ""}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                    )}
                    {selProduct && (
                      <div className="flex gap-2 mt-2">
                        <Input type="number" min={1} value={selQty} onChange={(e) => setSelQty(e.target.value)} className="w-24" />
                        <Button type="button" onClick={addItem} className="flex-1"><Plus className="h-4 w-4 mr-1" /> Adicionar item</Button>
                      </div>
                    )}
                    <div className="mt-3 space-y-1">
                      {form.items.length === 0 && <p className="text-xs text-muted-foreground py-2">Nenhum item.</p>}
                      {form.items.map((i, idx) => (
                        <div key={idx} className="flex items-center justify-between text-sm bg-muted/40 rounded p-2">
                          <span>{i.quantity}× {i.product_name}{i.variant_name ? ` — ${i.variant_name}` : ""}</span>
                          <div className="flex items-center gap-3">
                            <span className="font-semibold">{brl(i.quantity * i.unit_price)}</span>
                            <button type="button" onClick={() => setForm({ ...form, items: form.items.filter((_, j) => j !== idx) })}><Trash2 className="h-3.5 w-3.5 text-destructive" /></button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1.5"><Label>Desconto (R$)</Label><Input type="number" step="0.01" value={form.discount} onChange={(e) => setForm({ ...form, discount: e.target.value })} /></div>
                  <div className="space-y-1.5"><Label>Frete (R$)</Label><Input type="number" step="0.01" value={form.shipping} onChange={(e) => setForm({ ...form, shipping: e.target.value })} /></div>
                  <div className="col-span-2 space-y-1.5"><Label>Observações</Label><Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>

                  <div className="col-span-2 flex items-center justify-between bg-muted/50 rounded-lg p-3">
                    <span className="text-sm text-muted-foreground">Subtotal: {brl(subtotal)}</span>
                    <span className="text-2xl font-bold text-gradient-brand">{brl(total)}</span>
                  </div>

                  <div className="col-span-2 flex justify-end gap-2">
                    <Button type="button" variant="ghost" onClick={() => { setOpen(false); reset(); }}>Cancelar</Button>
                    {editingId ? (
                      <Button type="button" disabled={update.isPending} onClick={() => update.mutate()} className="bg-gradient-brand text-primary-foreground border-0">{update.isPending ? "Salvando…" : "Atualizar pedido"}</Button>
                    ) : (
                      <Button type="button" disabled={create.isPending} onClick={() => create.mutate()} className="bg-gradient-brand text-primary-foreground border-0">{create.isPending ? "Salvando…" : "Registrar pedido"}</Button>
                    )}
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        }
      />

      <Card className="p-4 shadow-card">
        <Table>
          <TableHeader><TableRow><TableHead>Código</TableHead><TableHead>Cliente</TableHead><TableHead>Canal</TableHead><TableHead>Pagamento</TableHead><TableHead>Status</TableHead><TableHead>Data</TableHead><TableHead className="text-right">Total</TableHead><TableHead></TableHead></TableRow></TableHeader>
          <TableBody>
            {(orders ?? []).length === 0 && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-12">Nenhum pedido ainda.</TableCell></TableRow>}
            {(orders ?? []).map((o: any) => (
              <TableRow key={o.id}>
                <TableCell className="font-mono text-xs">{o.order_code}</TableCell>
                <TableCell className="font-medium">{o.customers?.name ?? o.customer_name_freeform ?? "Cliente avulso"}</TableCell>
                <TableCell><Badge variant="outline">{channelLabel(o.channel)}</Badge></TableCell>
                <TableCell className="text-sm">
                  {paymentMethodLabel(o.payment_method)}
                  {o.payment_method_2 && <span className="text-xs"> + {paymentMethodLabel(o.payment_method_2)}</span>}
                  <br /><span className="text-xs text-muted-foreground">{paymentStatusLabel(o.payment_status)}</span>
                  {o.payment_proof_url && <button type="button" onClick={() => openProof(o.payment_proof_url)} className="inline-flex items-center text-[10px] text-primary ml-1"><FileText className="h-3 w-3" /></button>}
                </TableCell>
                <TableCell><Badge variant="secondary">{orderStatusLabel(o.status)}</Badge></TableCell>
                <TableCell className="text-sm">{dateTimeBR(o.created_at)}</TableCell>
                <TableCell className="text-right font-semibold">{brl(o.total)}</TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setDetailsId(o.id)}><Eye className="h-4 w-4" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => openEdit(o)}><Pencil className="h-4 w-4" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => { if (confirm(`Excluir pedido ${o.order_code}? O estoque será restaurado.`)) remove.mutate(o.id); }}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <OrderDetailsDialog orderId={detailsId} order={detailsOrder} onClose={() => setDetailsId(null)} />
    </div>
  );
}

function OrderDetailsDialog({ orderId, order, onClose }: { orderId: string | null; order: any; onClose: () => void }) {
  const { data: items } = useQuery({
    enabled: !!orderId,
    queryKey: ["order-items", orderId],
    queryFn: async () => (await supabase.from("order_items").select("*").eq("order_id", orderId!)).data ?? [],
  });
  if (!orderId || !order) return null;
  return (
    <Dialog open={!!orderId} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Pedido {order.order_code}</DialogTitle></DialogHeader>
        <div className="space-y-3 max-h-[75vh] overflow-y-auto">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div><span className="text-muted-foreground">Cliente:</span> {order.customers?.name ?? order.customer_name_freeform ?? "Avulso"}</div>
            <div><span className="text-muted-foreground">Data:</span> {dateTimeBR(order.created_at)}</div>
            <div><span className="text-muted-foreground">Canal:</span> {channelLabel(order.channel)}</div>
            <div><span className="text-muted-foreground">Status:</span> {orderStatusLabel(order.status)}</div>
            <div><span className="text-muted-foreground">Pagamento:</span> {paymentMethodLabel(order.payment_method)}{order.payment_method_2 ? ` + ${paymentMethodLabel(order.payment_method_2)}` : ""}</div>
            <div><span className="text-muted-foreground">Status pgto:</span> {paymentStatusLabel(order.payment_status)}</div>
            {order.payment_amount_1 != null && <div><span className="text-muted-foreground">Valor 1ª:</span> {brl(order.payment_amount_1)}</div>}
            {order.payment_amount_2 != null && <div><span className="text-muted-foreground">Valor 2ª:</span> {brl(order.payment_amount_2)}</div>}
          </div>
          {order.payment_proof_url && (
            <button
              type="button"
              onClick={async () => {
                const ref = order.payment_proof_url as string;
                if (/^https?:\/\//i.test(ref)) { window.open(ref, "_blank", "noopener,noreferrer"); return; }
                const { data } = await supabase.storage.from("payment-proofs").createSignedUrl(ref, 60);
                if (data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener,noreferrer");
              }}
              className="inline-flex items-center gap-1 text-sm text-primary underline"
            ><FileText className="h-4 w-4" /> Ver comprovante</button>
          )}
          <Table>
            <TableHeader><TableRow><TableHead>Produto</TableHead><TableHead className="text-center">Qtd</TableHead><TableHead className="text-right">Preço</TableHead><TableHead className="text-right">Subtotal</TableHead></TableRow></TableHeader>
            <TableBody>
              {(items ?? []).map((i: any) => (
                <TableRow key={i.id}>
                  <TableCell>{i.product_name}{i.variant_name ? ` — ${i.variant_name}` : ""}</TableCell>
                  <TableCell className="text-center">{i.quantity}</TableCell>
                  <TableCell className="text-right">{brl(i.unit_price)}</TableCell>
                  <TableCell className="text-right font-semibold">{brl(i.subtotal)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="rounded-lg bg-muted/50 p-3 text-sm space-y-1">
            <div className="flex justify-between"><span>Subtotal</span><span>{brl(order.subtotal)}</span></div>
            <div className="flex justify-between"><span>Desconto</span><span>− {brl(order.discount)}</span></div>
            <div className="flex justify-between"><span>Frete</span><span>{brl(order.shipping)}</span></div>
            <div className="flex justify-between text-base font-bold pt-1 border-t border-border"><span>Total</span><span className="text-gradient-brand">{brl(order.total)}</span></div>
          </div>
          {order.notes && <div className="text-sm"><span className="text-muted-foreground">Observações:</span> {order.notes}</div>}
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Fechar</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
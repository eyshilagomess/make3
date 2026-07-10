import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Plus, Trash2, Pencil, Copy, Tag } from "lucide-react";
import { toast } from "sonner";
import { brl } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/cupons")({
  head: () => ({ meta: [{ title: "Cupons — Make 3" }] }),
  component: Page,
});

const CATEGORIES = ["pele", "olhos", "boca", "skincare"] as const;
const CHANNELS = ["site", "shopee", "tiktok"] as const;

type Form = {
  code: string;
  description: string;
  discount_type: "percentage" | "fixed";
  discount_value: string;
  min_order_value: string;
  max_discount: string;
  usage_limit: string;
  per_customer_limit: string;
  valid_from: string;
  valid_until: string;
  applies_to: "all" | "categories" | "products";
  category_slugs: string[];
  channels: string[];
  first_purchase_only: boolean;
  stackable: boolean;
  free_shipping: boolean;
  active: boolean;
  notes: string;
};

const empty = (): Form => ({
  code: "", description: "", discount_type: "percentage", discount_value: "",
  min_order_value: "", max_discount: "", usage_limit: "", per_customer_limit: "",
  valid_from: "", valid_until: "", applies_to: "all", category_slugs: [],
  channels: ["site"], first_purchase_only: false, stackable: false, free_shipping: false,
  active: true, notes: "",
});

function Page() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Form>(empty());
  const [editingId, setEditingId] = useState<string | null>(null);

  const { data: coupons = [] } = useQuery({
    queryKey: ["coupons"],
    queryFn: async () => {
      const { data, error } = await supabase.from("coupons").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        code: form.code.trim().toUpperCase(),
        description: form.description || null,
        discount_type: form.discount_type,
        discount_value: Number(form.discount_value || 0),
        min_order_value: Number(form.min_order_value || 0),
        max_discount: form.max_discount ? Number(form.max_discount) : null,
        usage_limit: form.usage_limit ? Number(form.usage_limit) : null,
        per_customer_limit: form.per_customer_limit ? Number(form.per_customer_limit) : null,
        valid_from: form.valid_from || null,
        valid_until: form.valid_until || null,
        applies_to: form.applies_to,
        category_slugs: form.applies_to === "categories" ? form.category_slugs : [],
        product_ids: [],
        channels: form.channels,
        first_purchase_only: form.first_purchase_only,
        stackable: form.stackable,
        free_shipping: form.free_shipping,
        active: form.active,
        notes: form.notes || null,
      };
      if (!payload.code) throw new Error("Código obrigatório");
      if (editingId) {
        const { error } = await supabase.from("coupons").update(payload).eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("coupons").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editingId ? "Cupom atualizado" : "Cupom criado");
      qc.invalidateQueries({ queryKey: ["coupons"] });
      setOpen(false); setForm(empty()); setEditingId(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("coupons").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Cupom excluído"); qc.invalidateQueries({ queryKey: ["coupons"] }); },
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.from("coupons").update({ active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["coupons"] }),
  });

  const openEdit = (c: any) => {
    setEditingId(c.id);
    setForm({
      code: c.code, description: c.description ?? "",
      discount_type: c.discount_type, discount_value: String(c.discount_value ?? ""),
      min_order_value: String(c.min_order_value ?? ""),
      max_discount: c.max_discount != null ? String(c.max_discount) : "",
      usage_limit: c.usage_limit != null ? String(c.usage_limit) : "",
      per_customer_limit: c.per_customer_limit != null ? String(c.per_customer_limit) : "",
      valid_from: c.valid_from ? c.valid_from.slice(0, 16) : "",
      valid_until: c.valid_until ? c.valid_until.slice(0, 16) : "",
      applies_to: c.applies_to,
      category_slugs: c.category_slugs ?? [],
      channels: c.channels ?? ["site"],
      first_purchase_only: !!c.first_purchase_only,
      stackable: !!c.stackable,
      free_shipping: !!c.free_shipping,
      active: !!c.active,
      notes: c.notes ?? "",
    });
    setOpen(true);
  };

  const toggleInArray = (arr: string[], v: string) =>
    arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      <PageHeader
        title="Cupons"
        subtitle="Descontos aplicáveis na loja"
        actions={
          <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setForm(empty()); setEditingId(null); } }}>
            <DialogTrigger asChild>
              <Button className="gap-2"><Plus className="h-4 w-4" /> Novo cupom</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>{editingId ? "Editar cupom" : "Novo cupom"}</DialogTitle></DialogHeader>
              <div className="grid gap-4 py-2">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Código</Label>
                    <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="BEMVINDA10" />
                  </div>
                  <div className="flex items-end gap-2">
                    <div className="flex items-center gap-2 pb-2">
                      <Switch checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} />
                      <Label>Ativo</Label>
                    </div>
                  </div>
                </div>
                <div>
                  <Label>Descrição interna</Label>
                  <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Tipo</Label>
                    <Select value={form.discount_type} onValueChange={(v: "percentage" | "fixed") => setForm({ ...form, discount_type: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="percentage">Percentual (%)</SelectItem>
                        <SelectItem value="fixed">Valor fixo (R$)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Valor {form.discount_type === "percentage" ? "(%)" : "(R$)"}</Label>
                    <Input type="number" step="0.01" value={form.discount_value} onChange={(e) => setForm({ ...form, discount_value: e.target.value })} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Pedido mínimo (R$)</Label>
                    <Input type="number" step="0.01" value={form.min_order_value} onChange={(e) => setForm({ ...form, min_order_value: e.target.value })} />
                  </div>
                  {form.discount_type === "percentage" && (
                    <div>
                      <Label>Teto de desconto (R$)</Label>
                      <Input type="number" step="0.01" value={form.max_discount} onChange={(e) => setForm({ ...form, max_discount: e.target.value })} placeholder="opcional" />
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Limite total de usos</Label>
                    <Input type="number" value={form.usage_limit} onChange={(e) => setForm({ ...form, usage_limit: e.target.value })} placeholder="ilimitado" />
                  </div>
                  <div>
                    <Label>Limite por cliente</Label>
                    <Input type="number" value={form.per_customer_limit} onChange={(e) => setForm({ ...form, per_customer_limit: e.target.value })} placeholder="ilimitado" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Válido de</Label>
                    <Input type="datetime-local" value={form.valid_from} onChange={(e) => setForm({ ...form, valid_from: e.target.value })} />
                  </div>
                  <div>
                    <Label>Válido até</Label>
                    <Input type="datetime-local" value={form.valid_until} onChange={(e) => setForm({ ...form, valid_until: e.target.value })} />
                  </div>
                </div>

                <div>
                  <Label>Aplica-se a</Label>
                  <Select value={form.applies_to} onValueChange={(v: Form["applies_to"]) => setForm({ ...form, applies_to: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos os produtos</SelectItem>
                      <SelectItem value="categories">Categorias específicas</SelectItem>
                      <SelectItem value="products">Produtos específicos (via API)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {form.applies_to === "categories" && (
                  <div>
                    <Label>Categorias</Label>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {CATEGORIES.map((c) => (
                        <Badge
                          key={c}
                          variant={form.category_slugs.includes(c) ? "default" : "outline"}
                          className="cursor-pointer capitalize"
                          onClick={() => setForm({ ...form, category_slugs: toggleInArray(form.category_slugs, c) })}
                        >{c}</Badge>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <Label>Canais</Label>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {CHANNELS.map((c) => (
                      <Badge
                        key={c}
                        variant={form.channels.includes(c) ? "default" : "outline"}
                        className="cursor-pointer capitalize"
                        onClick={() => setForm({ ...form, channels: toggleInArray(form.channels, c) })}
                      >{c}</Badge>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="flex items-center gap-2">
                    <Switch checked={form.first_purchase_only} onCheckedChange={(v) => setForm({ ...form, first_purchase_only: v })} />
                    <Label>Só 1ª compra</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch checked={form.free_shipping} onCheckedChange={(v) => setForm({ ...form, free_shipping: v })} />
                    <Label>Frete grátis</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch checked={form.stackable} onCheckedChange={(v) => setForm({ ...form, stackable: v })} />
                    <Label>Combinável</Label>
                  </div>
                </div>

                <div>
                  <Label>Observações</Label>
                  <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
                </div>

                <Button onClick={() => save.mutate()} disabled={save.isPending}>
                  {save.isPending ? "Salvando..." : editingId ? "Atualizar" : "Criar cupom"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        }
      />

      <Card className="p-4 mb-4 bg-muted/30">
        <div className="text-sm">
          <div className="font-semibold mb-1 flex items-center gap-2"><Tag className="h-4 w-4" /> Endpoint para o e-commerce</div>
          <div className="text-muted-foreground mb-2">Validar cupom no checkout da loja:</div>
          <div className="flex items-center gap-2">
            <code className="text-xs bg-background px-2 py-1 rounded flex-1 overflow-x-auto">POST https://make3.lovable.app/api/public/coupons/validate</code>
            <Button size="sm" variant="ghost" onClick={() => { navigator.clipboard.writeText("https://make3.lovable.app/api/public/coupons/validate"); toast.success("Copiado"); }}>
              <Copy className="h-4 w-4" />
            </Button>
          </div>
          <div className="text-xs text-muted-foreground mt-2">
            Header: <code>x-store-key: &lt;STORE_API_KEY&gt;</code><br />
            Body: <code>{`{ code, channel, customer_email, items:[{product_id,quantity,unit_price,category_slug}], shipping }`}</code><br />
            Resposta: <code>{`{ valid, discount, shipping_discount, new_total, coupon }`}</code>
          </div>
        </div>
      </Card>

      <Card className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Código</TableHead>
              <TableHead>Desconto</TableHead>
              <TableHead>Mín. pedido</TableHead>
              <TableHead>Usos</TableHead>
              <TableHead>Validade</TableHead>
              <TableHead>Escopo</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {coupons.length === 0 && (
              <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Nenhum cupom cadastrado</TableCell></TableRow>
            )}
            {coupons.map((c: any) => (
              <TableRow key={c.id}>
                <TableCell className="font-mono font-semibold">{c.code}</TableCell>
                <TableCell>{c.discount_type === "percentage" ? `${c.discount_value}%` : brl(c.discount_value)}</TableCell>
                <TableCell>{Number(c.min_order_value) > 0 ? brl(c.min_order_value) : "—"}</TableCell>
                <TableCell>{c.used_count}{c.usage_limit ? ` / ${c.usage_limit}` : ""}</TableCell>
                <TableCell className="text-xs">
                  {c.valid_until ? new Date(c.valid_until).toLocaleDateString("pt-BR") : "sem prazo"}
                </TableCell>
                <TableCell className="text-xs">
                  {c.applies_to === "all" ? "Tudo" : c.applies_to === "categories" ? (c.category_slugs || []).join(", ") : "Produtos"}
                  {c.free_shipping && <Badge variant="secondary" className="ml-1">frete</Badge>}
                </TableCell>
                <TableCell>
                  <Switch checked={c.active} onCheckedChange={(v) => toggleActive.mutate({ id: c.id, active: v })} />
                </TableCell>
                <TableCell className="text-right">
                  <Button size="icon" variant="ghost" onClick={() => openEdit(c)}><Pencil className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => { if (confirm(`Excluir cupom ${c.code}?`)) remove.mutate(c.id); }}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
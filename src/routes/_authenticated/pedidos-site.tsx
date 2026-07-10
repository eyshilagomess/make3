import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Truck, PackageCheck, ExternalLink } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { notifyOrderEvent } from "@/lib/order-notify.functions";
import { brl as formatBRL } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/pedidos-site")({
  component: PedidosSite,
  errorComponent: ({ error }) => <div className="p-6 text-sm text-destructive">{error.message}</div>,
  notFoundComponent: () => <div className="p-6">Não encontrado</div>,
});

function PedidosSite() {
  const qc = useQueryClient();
  const notify = useServerFn(notifyOrderEvent);
  const [tracking, setTracking] = useState<Record<string, string>>({});

  const { data: orders } = useQuery({
    queryKey: ["orders", "site"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*, customers(name,email,phone), order_items(*)")
        .eq("channel", "site")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  const markShipped = async (o: any) => {
    const code = (tracking[o.id] ?? o.tracking_code ?? "").trim();
    const { error } = await supabase
      .from("orders")
      .update({ status: "enviado", tracking_code: code || null, shipped_at: new Date().toISOString() })
      .eq("id", o.id);
    if (error) { toast.error(error.message); return; }
    await notify({ data: { orderId: o.id, kind: "shipped" } });
    toast.success("Marcado como enviado + email enviado");
    qc.invalidateQueries({ queryKey: ["orders", "site"] });
  };

  const markDelivered = async (o: any) => {
    const { error } = await supabase
      .from("orders")
      .update({ status: "entregue", delivered_at: new Date().toISOString() })
      .eq("id", o.id);
    if (error) { toast.error(error.message); return; }
    await notify({ data: { orderId: o.id, kind: "delivered" } });
    toast.success("Marcado como entregue + email enviado");
    qc.invalidateQueries({ queryKey: ["orders", "site"] });
  };

  return (
    <div className="p-4 md:p-6 space-y-4">
      <PageHeader
        title="Pedidos Site"
        subtitle="Pedidos do e-commerce Make 3 — ligados ao estoque e à conta Infinity Pay."
      />
      <div className="grid gap-3">
        {(orders ?? []).length === 0 && (
          <Card><CardContent className="p-6 text-center text-muted-foreground">Nenhum pedido do site ainda.</CardContent></Card>
        )}
        {(orders ?? []).map((o: any) => (
          <Card key={o.id}>
            <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  {o.order_code}
                  <Badge variant="outline">{o.status}</Badge>
                  <Badge variant={o.payment_status === "pago" ? "default" : "secondary"}>{o.payment_status}</Badge>
                </CardTitle>
                <div className="text-xs text-muted-foreground mt-1">
                  {o.customers?.name ?? "—"} · {o.customers?.email ?? o.customers?.phone ?? ""}
                </div>
                <div className="text-xs text-muted-foreground">
                  {new Date(o.created_at).toLocaleString("pt-BR")}
                </div>
              </div>
              <div className="text-right">
                <div className="font-semibold">{formatBRL(Number(o.total ?? 0))}</div>
                {o.payment_link && (
                  <a href={o.payment_link} target="_blank" rel="noreferrer" className="text-xs text-primary inline-flex items-center gap-1">
                    Link pagamento <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <ul className="list-disc pl-5 text-muted-foreground">
                {(o.order_items ?? []).map((it: any) => (
                  <li key={it.id}>
                    {it.quantity}× {it.product_name}{it.variant_name ? ` — ${it.variant_name}` : ""} · {formatBRL(Number(it.unit_price))}
                  </li>
                ))}
              </ul>
              {o.shipping_address && (
                <div className="text-xs text-muted-foreground">
                  <b>Envio:</b> CEP {o.shipping_cep} · {o.shipping_carrier ?? "-"} {o.shipping_service ? `(${o.shipping_service})` : ""}
                </div>
              )}
              <div className="flex flex-wrap items-end gap-2 pt-2">
                <div className="grow min-w-40">
                  <label className="text-xs text-muted-foreground">Código de rastreio</label>
                  <Input
                    value={tracking[o.id] ?? o.tracking_code ?? ""}
                    onChange={(e) => setTracking((t) => ({ ...t, [o.id]: e.target.value }))}
                    placeholder="Ex: BR1234..."
                  />
                </div>
                <Button size="sm" onClick={() => markShipped(o)} disabled={o.status === "enviado" || o.status === "entregue"}>
                  <Truck className="h-4 w-4 mr-1" /> Marcar enviado
                </Button>
                <Button size="sm" variant="secondary" onClick={() => markDelivered(o)} disabled={o.status === "entregue"}>
                  <PackageCheck className="h-4 w-4 mr-1" /> Marcar entregue
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
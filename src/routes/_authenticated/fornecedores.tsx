import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/fornecedores")({
  head: () => ({ meta: [{ title: "Fornecedores — Make 3" }] }),
  component: Page,
});

type Form = { name: string; contact_name: string; phone: string; whatsapp: string; email: string; instagram: string; lead_time_days: string; notes: string };
const empty: Form = { name: "", contact_name: "", phone: "", whatsapp: "", email: "", instagram: "", lead_time_days: "", notes: "" };

function Page() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Form>(empty);

  const { data } = useQuery({
    queryKey: ["suppliers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("suppliers").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const create = useMutation({
    mutationFn: async (f: Form) => {
      const payload: any = { ...f, lead_time_days: f.lead_time_days ? Number(f.lead_time_days) : null };
      const { error } = await supabase.from("suppliers").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["suppliers"] }); toast.success("Fornecedor cadastrado!"); setOpen(false); setForm(empty); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-7xl mx-auto">
      <PageHeader title="Fornecedores" subtitle="Gestão de fornecedores e compras"
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button className="bg-gradient-brand text-primary-foreground border-0 shadow-glow"><Plus className="h-4 w-4 mr-1" /> Novo fornecedor</Button></DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader><DialogTitle>Novo fornecedor</DialogTitle></DialogHeader>
              <form onSubmit={(e) => { e.preventDefault(); create.mutate(form); }} className="grid grid-cols-2 gap-3">
                <div className="col-span-2 space-y-1.5"><Label>Nome *</Label><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>Pessoa de contato</Label><Input value={form.contact_name} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>Telefone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>WhatsApp</Label><Input value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>Instagram</Label><Input value={form.instagram} onChange={(e) => setForm({ ...form, instagram: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>Prazo de entrega (dias)</Label><Input type="number" value={form.lead_time_days} onChange={(e) => setForm({ ...form, lead_time_days: e.target.value })} /></div>
                <div className="col-span-2 space-y-1.5"><Label>Observações</Label><Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
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
        <Table>
          <TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>Contato</TableHead><TableHead>Telefone</TableHead><TableHead>Instagram</TableHead><TableHead>Prazo</TableHead></TableRow></TableHeader>
          <TableBody>
            {(data ?? []).length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-12">Nenhum fornecedor cadastrado.</TableCell></TableRow>}
            {(data ?? []).map((s: any) => (
              <TableRow key={s.id}>
                <TableCell className="font-medium">{s.name}</TableCell>
                <TableCell>{s.contact_name ?? "—"}</TableCell>
                <TableCell>{s.phone ?? s.whatsapp ?? "—"}</TableCell>
                <TableCell>{s.instagram ?? "—"}</TableCell>
                <TableCell>{s.lead_time_days ? `${s.lead_time_days} dias` : "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
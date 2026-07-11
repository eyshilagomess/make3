import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import logo from "@/assets/make3-logo.jpg";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Entrar — Make 3" }] }),
  component: AuthPage,
});

function AuthPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) navigate({ to: "/dashboard", replace: true });
  }, [user, navigate]);

  const handle = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const cleanUser = username.trim().toLowerCase().replace(/[^a-z0-9_.-]/g, "");
    const email = `${cleanUser}@make3.local`;
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      toast.success("Bem-vinda de volta!");
    } catch (err: any) {
      toast.error(err.message ?? "Erro ao autenticar");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background">
      <div className="hidden lg:flex flex-col justify-between p-12 bg-gradient-surface relative overflow-hidden">
        <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full bg-primary/30 blur-3xl" />
        <div className="absolute -bottom-32 -left-32 w-96 h-96 rounded-full bg-primary-glow/20 blur-3xl" />
        <img src={logo} alt="Make 3" className="h-20 w-auto rounded-lg relative" />
        <div className="relative">
          <h2 className="text-5xl font-bold tracking-tight leading-tight">
            Beleza prática,
            <br />
            <span className="text-gradient-brand">gestão completa.</span>
          </h2>
          <p className="text-muted-foreground mt-4 max-w-md">
            A plataforma da Make 3 para controlar vendas, estoque, clientes e financeiro em um único lugar.
          </p>
        </div>
        <div className="text-xs text-muted-foreground relative">© Make 3 · beleza prática e acessível</div>
      </div>

      <div className="flex items-center justify-center p-6 lg:p-12">
        <Card className="w-full max-w-md p-8 shadow-card">
          <div className="lg:hidden flex justify-center mb-6">
            <img src={logo} alt="Make 3" className="h-16 w-auto rounded-lg" />
          </div>
          <h1 className="text-2xl font-bold">Acesse sua conta</h1>
          <p className="text-sm text-muted-foreground mt-1">Entre com seu usuário e senha.</p>

          <form onSubmit={handle} className="space-y-4 mt-6">
            <div className="space-y-1.5">
              <Label htmlFor="username">Usuário</Label>
              <Input id="username" autoCapitalize="none" autoCorrect="off" value={username} onChange={(e) => setUsername(e.target.value)} required placeholder="ex: eyshilagomes" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Senha</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
            </div>
            <Button type="submit" className="w-full bg-gradient-brand text-primary-foreground border-0 shadow-glow" disabled={loading}>
              {loading ? "Aguarde…" : "Entrar"}
            </Button>
          </form>

          <p className="mt-4 w-full text-center text-xs text-muted-foreground">
            Acesso restrito à equipe Make 3. Peça a um administrador para criar sua conta.
          </p>
        </Card>
      </div>
    </div>
  );
}
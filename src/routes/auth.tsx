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
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
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
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName || cleanUser } },
        });
        if (error) throw error;
        toast.success("Conta criada! Você já pode entrar.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Bem-vinda de volta!");
      }
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
          <h1 className="text-2xl font-bold">{mode === "signin" ? "Acesse sua conta" : "Criar conta"}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {mode === "signin" ? "Entre com seu usuário e senha." : "Crie uma conta da equipe Make 3."}
          </p>

          <form onSubmit={handle} className="space-y-4 mt-6">
            {mode === "signup" && (
              <div className="space-y-1.5">
                <Label htmlFor="name">Nome completo</Label>
                <Input id="name" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="username">Usuário</Label>
              <Input id="username" autoCapitalize="none" autoCorrect="off" value={username} onChange={(e) => setUsername(e.target.value)} required placeholder="ex: eyshilagomes" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Senha</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
            </div>
            <Button type="submit" className="w-full bg-gradient-brand text-primary-foreground border-0 shadow-glow" disabled={loading}>
              {loading ? "Aguarde…" : mode === "signin" ? "Entrar" : "Criar conta"}
            </Button>
          </form>

          <button
            type="button"
            className="mt-4 w-full text-sm text-muted-foreground hover:text-foreground transition"
            onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          >
            {mode === "signin" ? "Não tem conta? Criar agora" : "Já tem conta? Entrar"}
          </button>
        </Card>
      </div>
    </div>
  );
}
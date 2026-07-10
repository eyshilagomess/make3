import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, ShoppingBag, Package, Users, Truck, Boxes, LogOut, BarChart3, Menu, Receipt, PiggyBank, CalendarCheck, Tag } from "lucide-react";
import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import logo from "@/assets/make3-logo.jpg";

const nav = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/pedidos", label: "Pedidos", icon: ShoppingBag },
  { to: "/vendas", label: "Vendas", icon: BarChart3 },
  { to: "/produtos", label: "Produtos", icon: Package },
  { to: "/estoque", label: "Movimentações", icon: Boxes },
  { to: "/gastos", label: "Gastos", icon: Receipt },
  { to: "/fechamento", label: "Fechamento", icon: CalendarCheck },
  { to: "/alocacao", label: "Alocação", icon: PiggyBank },
  { to: "/cupons", label: "Cupons", icon: Tag },
  { to: "/clientes", label: "Clientes", icon: Users },
  { to: "/fornecedores", label: "Fornecedores", icon: Truck },
] as const;

export function AppShell() {
  const { user, signOut } = useAuth();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);
  useEffect(() => { setOpen(false); }, [path]);

  const navContent = (
    <>
      <div className="p-5 border-b border-sidebar-border">
        <img src={logo} alt="Make 3" className="h-14 w-auto rounded-md" />
      </div>
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {nav.map((item) => {
          const Icon = item.icon;
          const active = path.startsWith(item.to);
          return (
            <Link
              key={item.to}
              to={item.to}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                active
                  ? "bg-gradient-brand text-primary-foreground shadow-glow"
                  : "text-sidebar-foreground hover:bg-sidebar-accent"
              }`}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="p-3 border-t border-sidebar-border space-y-2">
        <div className="px-3 py-2 text-xs text-sidebar-foreground/60 truncate">{user?.email}</div>
        <Button variant="ghost" size="sm" className="w-full justify-start gap-2" onClick={() => signOut()}>
          <LogOut className="h-4 w-4" /> Sair
        </Button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen flex bg-background">
      <aside className="hidden md:flex w-64 shrink-0 bg-sidebar border-r border-sidebar-border flex-col">
        {navContent}
      </aside>
      <header className="md:hidden fixed top-0 inset-x-0 z-40 h-14 flex items-center justify-between gap-2 px-3 bg-sidebar border-b border-sidebar-border">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Abrir menu"><Menu className="h-5 w-5" /></Button>
          </SheetTrigger>
          <SheetContent side="left" className="p-0 w-64 bg-sidebar border-sidebar-border flex flex-col">
            {navContent}
          </SheetContent>
        </Sheet>
        <img src={logo} alt="Make 3" className="h-9 w-auto rounded-md" />
        <div className="w-9" />
      </header>
      <main className="flex-1 overflow-auto pt-14 md:pt-0">
        <Outlet />
      </main>
    </div>
  );
}
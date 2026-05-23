
-- Roles enum and table (separate from profiles to avoid privilege escalation)
CREATE TYPE public.app_role AS ENUM ('admin', 'gerente', 'vendedor');

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  email TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

-- Security definer to avoid recursive RLS
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.is_team_member(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id)
$$;

-- Auto-create profile + first user becomes admin
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  user_count INT;
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email), NEW.email);

  SELECT COUNT(*) INTO user_count FROM public.user_roles;
  IF user_count = 0 THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'vendedor');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

-- Enums for domain
CREATE TYPE public.sales_channel AS ENUM ('presencial','site','instagram','shopee','tiktok_shop','woocommerce','whatsapp','outros');
CREATE TYPE public.payment_method AS ENUM ('pix','cartao_credito','cartao_debito','dinheiro','boleto','transferencia','outros');
CREATE TYPE public.payment_status AS ENUM ('pendente','aguardando_conferencia','confirmado','estornado');
CREATE TYPE public.order_status AS ENUM ('pendente','em_preparacao','enviado','entregue','cancelado','devolvido');
CREATE TYPE public.stock_movement_type AS ENUM ('entrada','saida','ajuste','devolucao','perda','brinde','uso_interno','vencimento','erro_contagem');
CREATE TYPE public.product_status AS ENUM ('ativo','inativo','descontinuado');

-- Suppliers
CREATE TABLE public.suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  contact_name TEXT,
  phone TEXT,
  email TEXT,
  instagram TEXT,
  whatsapp TEXT,
  lead_time_days INT,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER suppliers_updated BEFORE UPDATE ON public.suppliers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Customers
CREATE TABLE public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  instagram TEXT,
  address TEXT,
  birthdate DATE,
  origin_channel public.sales_channel,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER customers_updated BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Products
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  sku TEXT UNIQUE,
  category TEXT,
  brand TEXT,
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  photo_url TEXT,
  description TEXT,
  cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  price NUMERIC(12,2) NOT NULL DEFAULT 0,
  stock INT NOT NULL DEFAULT 0,
  min_stock INT NOT NULL DEFAULT 0,
  status public.product_status NOT NULL DEFAULT 'ativo',
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER products_updated BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_products_status ON public.products(status);

-- Stock movements
CREATE TABLE public.stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  movement_type public.stock_movement_type NOT NULL,
  quantity INT NOT NULL,
  reason TEXT,
  reference_order_id UUID,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_stock_movements_product ON public.stock_movements(product_id, created_at DESC);

-- Orders
CREATE SEQUENCE public.order_code_seq START 1000;

CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_code TEXT NOT NULL UNIQUE DEFAULT ('M3-' || lpad(nextval('public.order_code_seq')::text, 6, '0')),
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  channel public.sales_channel NOT NULL DEFAULT 'presencial',
  seller_id UUID REFERENCES auth.users(id),
  payment_method public.payment_method,
  payment_status public.payment_status NOT NULL DEFAULT 'pendente',
  status public.order_status NOT NULL DEFAULT 'pendente',
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount NUMERIC(12,2) NOT NULL DEFAULT 0,
  shipping NUMERIC(12,2) NOT NULL DEFAULT 0,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes TEXT,
  payment_proof_url TEXT,
  external_reference TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER orders_updated BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_orders_created ON public.orders(created_at DESC);
CREATE INDEX idx_orders_status ON public.orders(status);
CREATE INDEX idx_orders_channel ON public.orders(channel);

-- Order items
CREATE TABLE public.order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  quantity INT NOT NULL CHECK (quantity > 0),
  unit_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  unit_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_order_items_order ON public.order_items(order_id);

-- Enable RLS on everything
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

-- Profiles: team members can view all profiles, users can update their own
CREATE POLICY "Team can view profiles" ON public.profiles FOR SELECT TO authenticated USING (public.is_team_member(auth.uid()));
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid());

-- user_roles: team can view; only admin can manage
CREATE POLICY "Team can view roles" ON public.user_roles FOR SELECT TO authenticated USING (public.is_team_member(auth.uid()));
CREATE POLICY "Admins manage roles" ON public.user_roles FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Generic team policy for operational tables
CREATE POLICY "Team read suppliers" ON public.suppliers FOR SELECT TO authenticated USING (public.is_team_member(auth.uid()));
CREATE POLICY "Team write suppliers" ON public.suppliers FOR INSERT TO authenticated WITH CHECK (public.is_team_member(auth.uid()));
CREATE POLICY "Team update suppliers" ON public.suppliers FOR UPDATE TO authenticated USING (public.is_team_member(auth.uid()));
CREATE POLICY "Admin/gerente delete suppliers" ON public.suppliers FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gerente'));

CREATE POLICY "Team read customers" ON public.customers FOR SELECT TO authenticated USING (public.is_team_member(auth.uid()));
CREATE POLICY "Team write customers" ON public.customers FOR INSERT TO authenticated WITH CHECK (public.is_team_member(auth.uid()));
CREATE POLICY "Team update customers" ON public.customers FOR UPDATE TO authenticated USING (public.is_team_member(auth.uid()));
CREATE POLICY "Admin/gerente delete customers" ON public.customers FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gerente'));

CREATE POLICY "Team read products" ON public.products FOR SELECT TO authenticated USING (public.is_team_member(auth.uid()));
CREATE POLICY "Team write products" ON public.products FOR INSERT TO authenticated WITH CHECK (public.is_team_member(auth.uid()));
CREATE POLICY "Team update products" ON public.products FOR UPDATE TO authenticated USING (public.is_team_member(auth.uid()));
CREATE POLICY "Admin/gerente delete products" ON public.products FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gerente'));

CREATE POLICY "Team read stock_movements" ON public.stock_movements FOR SELECT TO authenticated USING (public.is_team_member(auth.uid()));
CREATE POLICY "Team write stock_movements" ON public.stock_movements FOR INSERT TO authenticated WITH CHECK (public.is_team_member(auth.uid()));

CREATE POLICY "Team read orders" ON public.orders FOR SELECT TO authenticated USING (public.is_team_member(auth.uid()));
CREATE POLICY "Team write orders" ON public.orders FOR INSERT TO authenticated WITH CHECK (public.is_team_member(auth.uid()));
CREATE POLICY "Team update orders" ON public.orders FOR UPDATE TO authenticated USING (public.is_team_member(auth.uid()));
CREATE POLICY "Admin/gerente delete orders" ON public.orders FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gerente'));

CREATE POLICY "Team read order_items" ON public.order_items FOR SELECT TO authenticated USING (public.is_team_member(auth.uid()));
CREATE POLICY "Team write order_items" ON public.order_items FOR INSERT TO authenticated WITH CHECK (public.is_team_member(auth.uid()));
CREATE POLICY "Team update order_items" ON public.order_items FOR UPDATE TO authenticated USING (public.is_team_member(auth.uid()));
CREATE POLICY "Team delete order_items" ON public.order_items FOR DELETE TO authenticated USING (public.is_team_member(auth.uid()));

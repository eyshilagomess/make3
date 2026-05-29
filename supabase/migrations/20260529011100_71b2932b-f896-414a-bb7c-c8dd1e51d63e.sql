-- Custo médio + histórico de custo dos produtos
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS avg_cost numeric NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.product_cost_history (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id uuid NOT NULL,
  old_cost numeric NOT NULL DEFAULT 0,
  new_cost numeric NOT NULL DEFAULT 0,
  reason text,
  changed_by uuid,
  changed_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.product_cost_history TO authenticated;
GRANT ALL ON public.product_cost_history TO service_role;

ALTER TABLE public.product_cost_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team read product_cost_history"
ON public.product_cost_history FOR SELECT TO authenticated
USING (public.is_team_member(auth.uid()));

CREATE POLICY "Team write product_cost_history"
ON public.product_cost_history FOR INSERT TO authenticated
WITH CHECK (public.is_team_member(auth.uid()));

CREATE INDEX IF NOT EXISTS product_cost_history_product_id_idx
  ON public.product_cost_history(product_id, changed_at DESC);

-- Trigger: registra alteração de custo
CREATE OR REPLACE FUNCTION public.log_product_cost_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND COALESCE(OLD.cost, 0) <> COALESCE(NEW.cost, 0) THEN
    INSERT INTO public.product_cost_history (product_id, old_cost, new_cost, changed_by)
    VALUES (NEW.id, COALESCE(OLD.cost, 0), COALESCE(NEW.cost, 0), auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_product_cost_change ON public.products;
CREATE TRIGGER trg_log_product_cost_change
AFTER UPDATE OF cost ON public.products
FOR EACH ROW EXECUTE FUNCTION public.log_product_cost_change();
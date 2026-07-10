
CREATE OR REPLACE FUNCTION public.title_case_pt(txt text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  words text[];
  w text;
  result text := '';
  i int := 0;
  lower_set text[] := ARRAY['de','da','do','das','dos','e','com','para','a','o','as','os','em','por','no','na'];
BEGIN
  IF txt IS NULL THEN RETURN NULL; END IF;
  words := regexp_split_to_array(trim(regexp_replace(txt, '\s+', ' ', 'g')), ' ');
  FOREACH w IN ARRAY words LOOP
    i := i + 1;
    IF w = '' THEN CONTINUE; END IF;
    IF i > 1 AND lower(w) = ANY(lower_set) THEN
      result := result || ' ' || lower(w);
    ELSIF w ~ '^\d+$' THEN
      result := result || CASE WHEN i=1 THEN '' ELSE ' ' END || w;
    ELSE
      result := result || CASE WHEN i=1 THEN '' ELSE ' ' END || upper(substr(w,1,1)) || lower(substr(w,2));
    END IF;
  END LOOP;
  RETURN result;
END;
$$;

UPDATE public.products SET name = public.title_case_pt(name) WHERE name IS NOT NULL AND name <> public.title_case_pt(name);
UPDATE public.product_variants SET name = public.title_case_pt(name) WHERE name IS NOT NULL AND name <> public.title_case_pt(name);

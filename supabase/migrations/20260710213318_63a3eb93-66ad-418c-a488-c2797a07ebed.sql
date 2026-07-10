
ALTER FUNCTION public.title_case_pt(text) SECURITY INVOKER;
REVOKE ALL ON FUNCTION public.title_case_pt(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.title_case_pt(text) TO service_role;

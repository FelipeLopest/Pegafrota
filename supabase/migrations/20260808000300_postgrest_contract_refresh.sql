-- PegaNaFrota v10 — guarda de contrato e refresh explícito do PostgREST.
--
-- Evita o cenário em que o cliente novo chega antes das RPCs da migration de
-- completude, e força o PostgREST a recarregar a assinatura das funções.

do $$
begin
  if to_regprocedure('public.yard_snapshot()') is null then
    raise exception 'BACKEND_CONTRACT_MISSING: public.yard_snapshot()';
  end if;
  if to_regprocedure('public.update_driver(uuid,jsonb)') is null then
    raise exception 'BACKEND_CONTRACT_MISSING: public.update_driver(uuid,jsonb)';
  end if;
  if to_regprocedure('public.create_location(text,text,text,text,text,text,text,text,text)') is null then
    raise exception 'BACKEND_CONTRACT_MISSING: public.create_location(...)';
  end if;
  if to_regprocedure('public.update_location(uuid,jsonb)') is null then
    raise exception 'BACKEND_CONTRACT_MISSING: public.update_location(uuid,jsonb)';
  end if;
end $$;

notify pgrst, 'reload schema';

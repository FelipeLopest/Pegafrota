-- =============================================================================
-- PegaNaFrota — 001200 — RPCs de identidade
-- =============================================================================
-- Contrato AuthContext de MODULE_MAP.md.
-- =============================================================================

create or replace function public.my_context()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_result  jsonb;
begin
  v_user_id := private.current_user_id();

  if v_user_id is null then
    return jsonb_build_object(
      'authenticated', false,
      'sessionState', 'ANONYMOUS'
    );
  end if;

  select jsonb_build_object(
           'authenticated', true,
           'sessionState', case when cm.company_id is null then 'NO_ACTIVE_MEMBERSHIP' else 'ACTIVE' end,
           'userId', v_user_id,
           'companyId', cm.company_id,
           'role', cm.role,
           'permissions', to_jsonb(private.current_permissions()),
           'profile', jsonb_build_object(
             'fullName', p.full_name,
             'active', p.active,
             'lastSeenAt', p.last_seen_at
           ),
           'company', case
             when c.id is null then null
             else jsonb_build_object(
               'id', c.id,
               'tradeName', c.trade_name,
               'legalName', c.legal_name,
               'cnpj', c.cnpj,
               'timezone', c.timezone,
               'status', c.status
             )
           end
         )
    into v_result
  from public.profiles p
  left join private.current_membership() cm on true
  left join public.companies c on c.id = cm.company_id
  where p.id = v_user_id;

  return coalesce(
    v_result,
    jsonb_build_object('authenticated', true, 'sessionState', 'NO_PROFILE', 'userId', v_user_id)
  );
end;
$$;

comment on function public.my_context() is
  'Contexto completo da sessão: usuário, empresa, papel e permissões. Nunca devolve dados de outra empresa.';

create or replace function public.my_permissions()
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select private.current_permissions();
$$;

-- Registra presença sem permitir que o cliente escreva qualquer outro campo.
create or replace function public.touch_last_seen()
returns timestamptz
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_now     timestamptz := now();
begin
  v_user_id := private.current_user_id();
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  update public.profiles set last_seen_at = v_now where id = v_user_id;
  return v_now;
end;
$$;

revoke all on function public.my_context()      from public;
revoke all on function public.my_permissions()  from public;
revoke all on function public.touch_last_seen() from public;

grant execute on function public.my_context()      to authenticated;
grant execute on function public.my_permissions()  to authenticated;
grant execute on function public.touch_last_seen() to authenticated;

-- Aplique filtros a todo o histórico antes de selecionar uma página.
begin;

create function platform.list_audit_events_filtered(
  p_actor_user_id uuid,
  p_action text default null,
  p_result text default null,
  p_from date default null,
  p_to date default null,
  p_page integer default 1,
  p_page_size integer default 50,
  p_search text default null,
  p_timezone text default 'America/Sao_Paulo'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_page integer := greatest(coalesce(p_page, 1), 1);
  v_size integer := least(greatest(coalesce(p_page_size, 50), 1), 200);
  v_action text := nullif(private.fleet_text(btrim(p_action)), '');
  v_search text := nullif(private.fleet_text(btrim(p_search)), '');
  v_timezone text := coalesce(nullif(btrim(p_timezone), ''), 'America/Sao_Paulo');
  v_start timestamptz;
  v_end timestamptz;
  v_payload jsonb;
begin
  perform private.assert_platform_admin(p_actor_user_id);

  if p_from > p_to or char_length(p_search) > 200 or char_length(p_action) > 200 or not exists (
    select 1 from pg_catalog.pg_timezone_names z where z.name = v_timezone
  ) then
    raise exception 'INVALID_INPUT: informe um período e fuso horário válidos'
      using errcode = '22023', hint = 'INVALID_INPUT';
  end if;

  -- O limite é a meia-noite seguinte no mesmo fuso usado para exibir a lista.
  v_start := p_from::timestamp at time zone v_timezone;
  v_end := (p_to + 1)::timestamp at time zone v_timezone;

  with filtered as not materialized (
    select e.id, e.occurred_at, e.actor_user_id, p.full_name as actor_name, e.action,
      e.result, e.target_type, e.target_id, e.company_id, c.trade_name, e.request_id
    from platform.audit_events e
    left join public.profiles p on p.id = e.actor_user_id
    left join public.companies c on c.id = e.company_id
    where (v_action is null or strpos(private.fleet_text(e.action), v_action) > 0)
      and (p_result is null or e.result = p_result)
      and (v_start is null or e.occurred_at >= v_start)
      and (v_end is null or e.occurred_at < v_end)
      and (
        v_search is null or strpos(
          private.fleet_text(concat_ws(' ', p.full_name, c.trade_name, e.action, e.result)),
          v_search
        ) > 0
      )
  ), selection as (
    select * from filtered
    order by occurred_at desc, id desc
    offset (v_page::bigint - 1) * v_size
    limit v_size
  )
  select jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id,
        'occurredAt', s.occurred_at,
        'actorUserId', s.actor_user_id,
        'actorName', s.actor_name,
        'action', s.action,
        'result', s.result,
        'targetType', s.target_type,
        'targetId', s.target_id,
        'companyId', s.company_id,
        'companyTradeName', s.trade_name,
        'requestId', s.request_id
      ) order by s.occurred_at desc, s.id desc)
      from selection s
    ), '[]'::jsonb),
    'page', v_page,
    'pageSize', v_size,
    'total', (select count(*) from filtered)
  ) into v_payload;

  return v_payload;
end;
$$;

revoke all on function platform.list_audit_events_filtered(
  uuid, text, text, date, date, integer, integer, text, text
) from public, anon, authenticated;
grant execute on function platform.list_audit_events_filtered(
  uuid, text, text, date, date, integer, integer, text, text
) to service_role;

-- O painel já aceita e-mail na busca e o usa para reenviar convites.
create or replace function platform.list_company_admins_filtered(
  p_actor_user_id uuid,
  p_company_id uuid default null,
  p_search text default null,
  p_access text default null,
  p_account text default null,
  p_page integer default 1,
  p_page_size integer default 25
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_page integer := least(100000, greatest(coalesce(p_page, 1), 1));
  v_size integer := least(100, greatest(coalesce(p_page_size, 25), 1));
  v_search text := nullif(private.fleet_text(btrim(p_search)), '');
  v_payload jsonb;
begin
  perform private.assert_platform_admin(p_actor_user_id);
  if p_access not in ('active','inactive') or p_account not in ('active','blocked')
    or char_length(p_search) > 200 then
    raise exception 'INVALID_INPUT: confira os filtros da lista'
      using errcode = '22023', hint = 'VALIDATION_ERROR';
  end if;

  with filtered as not materialized (
    select m.id, m.user_id, m.company_id, m.role, m.created_at, m.active as membership_active,
      p.full_name, p.phone, p.active as account_active, p.last_seen_at, c.trade_name, au.email
    from public.company_memberships m
    join public.profiles p on p.id = m.user_id
    join public.companies c on c.id = m.company_id
    left join auth.users au on au.id = m.user_id
    where m.role = 'company_admin'
      and (p_company_id is null or m.company_id = p_company_id)
      and (p_access is null or m.active = (p_access = 'active'))
      and (p_account is null or p.active = (p_account = 'active'))
      and (
        v_search is null or strpos(
          private.fleet_text(concat_ws(' ', p.full_name, au.email, c.trade_name)),
          v_search
        ) > 0
      )
  ), selection as (
    select * from filtered
    order by created_at desc, user_id, id
    offset (v_page::bigint - 1) * v_size
    limit v_size
  ), counted as (
    select count(*) as total from filtered
  )
  select jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'userId', s.user_id, 'fullName', s.full_name, 'phone', s.phone, 'email', s.email,
        'companyId', s.company_id, 'companyTradeName', s.trade_name, 'role', s.role,
        'globalAccountActive', s.account_active, 'companyAccessActive', s.membership_active,
        'lastSeenAt', s.last_seen_at,
        'invite', (
          select jsonb_build_object(
            'status', case
              when i.accepted_at is not null then 'accepted'
              when i.revoked_at is not null then 'revoked'
              when i.expires_at <= now() then 'expired'
              else 'pending'
            end,
            'expiresAt', i.expires_at, 'resendAvailableAt', i.resend_available_at, 'sentAt', i.created_at
          )
          from platform.company_invites i
          where i.company_id = s.company_id and i.user_id = s.user_id
          order by i.created_at desc, i.id desc
          limit 1
        )
      ) order by s.created_at desc, s.user_id, s.id)
      from selection s
    ), '[]'::jsonb),
    'page', v_page, 'pageSize', v_size, 'total', counted.total,
    'hasNext', v_page::bigint * v_size < counted.total
  ) into v_payload
  from counted;
  return v_payload;
end;
$$;

notify pgrst, 'reload schema';

commit;

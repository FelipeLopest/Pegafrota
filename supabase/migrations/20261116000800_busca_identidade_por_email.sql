create function public.pnf_auth_user_by_email(p_email text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  contas jsonb;
begin
  select jsonb_agg(jsonb_build_object(
    'id', conta.id,
    'email', conta.email,
    'email_confirmed_at', conta.email_confirmed_at
  )) into contas
  from (
    select u.id, u.email, u.email_confirmed_at
    from auth.users u
    where lower(u.email) = nullif(lower(btrim(p_email)), '')
    limit 2
  ) conta;

  if jsonb_array_length(contas) > 1 then
    raise exception 'Há mais de uma conta de autenticação para este e-mail.'
      using errcode = 'P0001', hint = 'AUTH_EMAIL_AMBIGUOUS';
  end if;

  return contas -> 0;
end;
$$;

revoke all on function public.pnf_auth_user_by_email(text) from public, anon, authenticated;
grant execute on function public.pnf_auth_user_by_email(text) to service_role;

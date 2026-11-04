-- Run with: supabase test db
-- Smoke checks for the V1 hardening migration. Transaction is rolled back.
begin;

do $$
declare
  key_value text := encode(gen_random_bytes(16), 'hex');
  has_orders boolean;
  has_payments boolean;
begin
  select exists(select 1 from information_schema.columns
    where table_schema='public' and table_name='payments' and column_name='invoice_state')
    into has_payments;
  select exists(select 1 from information_schema.columns
    where table_schema='public' and table_name='orders' and column_name='invoice_expires_at')
    into has_orders;
  if not has_payments or not has_orders then
    raise exception 'Requirement V1 migration columns are missing';
  end if;

  if not public.consume_rate_limit('checkout', key_value, 2, 60) then
    raise exception 'First rate-limit request should pass';
  end if;
  if not public.consume_rate_limit('checkout', key_value, 2, 60) then
    raise exception 'Second rate-limit request should pass';
  end if;
  if public.consume_rate_limit('checkout', key_value, 2, 60) then
    raise exception 'Third rate-limit request should be blocked';
  end if;
end;
$$;

rollback;

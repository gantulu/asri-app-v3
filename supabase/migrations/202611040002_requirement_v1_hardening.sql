-- Requirement Perbaikan V1: transaction integrity, payment recovery, security and expiry.
-- Existing rows are preserved; this migration only adds constraints after normalizing known states.

alter table public.orders
  add column if not exists invoice_expires_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

alter table public.payments
  add column if not exists invoice_state text not null default 'creating',
  add column if not exists invoice_attempt_started_at timestamptz,
  add column if not exists invoice_attempt_id uuid,
  add column if not exists invoice_error text,
  add column if not exists updated_at timestamptz not null default now();

update public.payments
set invoice_state = case
  when payment_url is not null and duitku_reference is not null then 'ready'
  when status = 'needs_review' then 'needs_review'
  when status = 'failed' then 'failed'
  else 'creating'
end;

alter table public.payments
  drop constraint if exists payments_status_v1_check;
alter table public.payments
  add constraint payments_status_v1_check
  check (status in ('creating','pending','paid','failed','expired','needs_review')) not valid;
alter table public.payments validate constraint payments_status_v1_check;

alter table public.payments
  drop constraint if exists payments_invoice_state_v1_check;
alter table public.payments
  add constraint payments_invoice_state_v1_check
  check (invoice_state in ('creating','requesting','ready','unknown','failed','expired','needs_review')) not valid;
alter table public.payments validate constraint payments_invoice_state_v1_check;

alter table public.orders
  drop constraint if exists orders_status_v1_check;
alter table public.orders
  add constraint orders_status_v1_check
  check (order_status in ('pending_payment','processing','payment_review','cancelled','completed')) not valid;
alter table public.orders validate constraint orders_status_v1_check;

alter table public.orders
  drop constraint if exists orders_shipping_zero_v1_check;
alter table public.orders
  add constraint orders_shipping_zero_v1_check check (shipping_cost = 0) not valid;
-- NOT VALID preserves historical order snapshots while enforcing Rp0 on all new orders.

alter table public.orders
  drop constraint if exists orders_payment_status_v1_check;
alter table public.orders
  add constraint orders_payment_status_v1_check
  check (payment_status in ('creating','pending','paid','failed','expired','needs_review')) not valid;
alter table public.orders validate constraint orders_payment_status_v1_check;

create table if not exists public.rate_limit_buckets (
  scope text not null,
  key_hash text not null,
  window_started_at timestamptz not null,
  request_count integer not null default 0 check (request_count >= 0),
  primary key (scope, key_hash)
);
alter table public.rate_limit_buckets enable row level security;
revoke all on public.rate_limit_buckets from public, anon, authenticated;

create or replace function public.consume_rate_limit(
  p_scope text, p_key_hash text, p_limit integer, p_window_seconds integer
) returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare current_row public.rate_limit_buckets%rowtype;
begin
  if p_scope not in ('checkout','tracking','callback') or p_limit < 1 or p_window_seconds < 1 then
    raise exception 'INVALID_RATE_LIMIT_ARGUMENT';
  end if;
  insert into public.rate_limit_buckets(scope,key_hash,window_started_at,request_count)
  values(p_scope,p_key_hash,now(),1)
  on conflict (scope,key_hash) do nothing;
  select * into current_row from public.rate_limit_buckets
    where scope=p_scope and key_hash=p_key_hash for update;
  if current_row.window_started_at <= now() - make_interval(secs => p_window_seconds) then
    update public.rate_limit_buckets
      set window_started_at=now(),request_count=1
      where scope=p_scope and key_hash=p_key_hash;
    return true;
  end if;
  if current_row.request_count >= p_limit then return false; end if;
  update public.rate_limit_buckets set request_count=request_count+1
    where scope=p_scope and key_hash=p_key_hash;
  return true;
end;
$$;

create or replace function public.create_store_order(
  p_no text,p_token text,p_name text,p_email text,p_phone text,p_address jsonb,
  p_shipping bigint,p_items jsonb,p_key text,p_hash text
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  old public.checkout_idempotency%rowtype;
  pr public.products%rowtype;
  it jsonb;
  oid uuid;
  sub bigint := 0;
  q int;
  item_count integer;
  distinct_count integer;
begin
  if length(p_key) <> 64 or length(p_hash) <> 64 then raise exception 'INVALID_IDEMPOTENCY'; end if;
  if p_shipping <> 0 then raise exception 'SHIPPING_MUST_BE_ZERO'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1
     or jsonb_array_length(p_items) > 50 then raise exception 'CART_EMPTY_OR_TOO_LARGE'; end if;

  -- Serialize requests using the same idempotency key, including the absent-row case.
  perform pg_advisory_xact_lock(hashtextextended(p_key, 0));
  delete from public.checkout_idempotency where created_at < now() - interval '24 hours';
  select * into old from public.checkout_idempotency where key_hash=p_key for update;
  if found then
    if old.payload_hash <> p_hash then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    if old.order_id is not null then return jsonb_build_object('order_id',old.order_id); end if;
    raise exception 'IDEMPOTENCY_IN_PROGRESS';
  end if;

  select count(*),count(distinct value->>'product_id')
    into item_count,distinct_count from jsonb_array_elements(p_items);
  if item_count <> distinct_count then raise exception 'DUPLICATE_PRODUCT'; end if;

  insert into public.checkout_idempotency(key_hash,payload_hash)
    values(p_key,p_hash);

  -- Lock products in a deterministic order to reduce deadlock risk.
  for it in select value from jsonb_array_elements(p_items) order by value->>'product_id' loop
    if (it->>'product_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'INVALID_PRODUCT_ID';
    end if;
    if coalesce(it->>'quantity','') !~ '^[0-9]+$' then raise exception 'INVALID_QUANTITY'; end if;
    q := (it->>'quantity')::int;
    if q < 1 or q > 50 then raise exception 'INVALID_QUANTITY'; end if;
    select * into pr from public.products
      where id=(it->>'product_id')::uuid and is_active for update;
    if not found or pr.stock < q then raise exception 'INSUFFICIENT_STOCK'; end if;
    sub := sub + pr.price*q;
  end loop;

  insert into public.orders(
    order_number,guest_token_hash,customer_name,email,phone,shipping_address,
    subtotal,shipping_cost,total_amount,invoice_expires_at
  ) values (
    p_no,p_token,p_name,p_email,p_phone,p_address,sub,0,sub,now()+interval '60 minutes'
  ) returning id into oid;

  insert into public.payments(order_id,merchant_order_id,amount,status,invoice_state)
    values(oid,p_no,sub,'creating','creating');

  for it in select value from jsonb_array_elements(p_items) order by value->>'product_id' loop
    q := (it->>'quantity')::int;
    select * into pr from public.products where id=(it->>'product_id')::uuid;
    update public.products set stock=stock-q where id=pr.id;
    insert into public.order_items(order_id,product_id,product_name,unit_price,quantity,line_total)
      values(oid,pr.id,pr.name,pr.price,q,pr.price*q);
  end loop;

  update public.checkout_idempotency set order_id=oid where key_hash=p_key;
  return jsonb_build_object('order_id',oid);
end;
$$;

create or replace function public.claim_payment_invoice(p_order text,p_attempt uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare pay public.payments%rowtype;
begin
  select * into pay from public.payments where merchant_order_id=p_order for update;
  if not found then return jsonb_build_object('state','not_found'); end if;
  if pay.status='paid' then return jsonb_build_object('state','paid'); end if;
  if pay.status='failed' then return jsonb_build_object('state','failed'); end if;
  if pay.status='expired' then return jsonb_build_object('state','expired'); end if;
  if pay.status='needs_review' then return jsonb_build_object('state','needs_review'); end if;
  if pay.payment_url is not null and pay.duitku_reference is not null then
    return jsonb_build_object('state','ready','payment_url',pay.payment_url);
  end if;
  if pay.invoice_state='requesting' then
    if pay.invoice_attempt_started_at < now() - interval '2 minutes' then
      update public.payments set invoice_state='unknown',status='needs_review',
        invoice_error='Invoice request exceeded its processing lease',updated_at=now()
        where id=pay.id;
      update public.orders set payment_status='needs_review',order_status='payment_review',updated_at=now()
        where id=pay.order_id;
      return jsonb_build_object('state','unknown');
    end if;
    return jsonb_build_object('state','in_progress');
  end if;
  if pay.invoice_state in ('unknown','needs_review','failed','expired') then
    return jsonb_build_object('state',pay.invoice_state);
  end if;
  if pay.invoice_state <> 'creating' then
    return jsonb_build_object('state','needs_review');
  end if;
  update public.payments set invoice_state='requesting',
    invoice_attempt_started_at=now(),invoice_attempt_id=p_attempt,updated_at=now()
    where id=pay.id;
  update public.orders set invoice_expires_at=now()+interval '60 minutes',updated_at=now()
    where id=pay.order_id;
  return jsonb_build_object('state','claimed');
end;
$$;

create or replace function public.complete_duitku_invoice(
  p_order text,p_attempt uuid,p_ref text,p_url text,p_response jsonb
) returns text language plpgsql security definer set search_path=public,pg_temp as $$
declare pay public.payments%rowtype; pending jsonb; callback_status text;
begin
  select * into pay from public.payments where merchant_order_id=p_order for update;
  if not found then return 'NOT_FOUND'; end if;
  if pay.invoice_attempt_id is distinct from p_attempt then return 'ATTEMPT_MISMATCH'; end if;
  if pay.invoice_state='ready' and pay.duitku_reference=p_ref then return 'ALREADY_READY'; end if;
  if pay.invoice_state not in ('requesting','needs_review') then return 'INVALID_STATE'; end if;
  update public.payments set duitku_reference=p_ref,payment_url=p_url,
    provider_response=p_response,invoice_state='ready',status='pending',
    invoice_error=null,updated_at=now() where id=pay.id;
  update public.orders set payment_status='pending',updated_at=now() where id=pay.order_id;
  pending := pay.callback_payload;
  if pending is not null then
    callback_status := case pending->>'resultCode'
      when '00' then 'paid' when '01' then 'failed' else 'needs_review' end;
    return public.apply_duitku_callback(
      p_order,p_ref,(pending->>'amount')::bigint,callback_status,pending
    );
  end if;
  return 'READY';
end;
$$;

create or replace function public.mark_invoice_unknown(p_order text,p_attempt uuid,p_reason text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
  update public.payments set invoice_state='unknown',status='needs_review',
    invoice_error=left(coalesce(p_reason,'Ambiguous Duitku response'),500),updated_at=now()
  where merchant_order_id=p_order and invoice_attempt_id=p_attempt
    and invoice_state='requesting';
  update public.orders set payment_status='needs_review',order_status='payment_review',updated_at=now()
  where order_number=p_order and exists (
    select 1 from public.payments p where p.merchant_order_id=p_order and p.invoice_attempt_id=p_attempt
  );
  return found;
end;
$$;

create or replace function public.fail_invoice_attempt(p_order text,p_attempt uuid,p_reason text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare pay public.payments%rowtype; o public.orders%rowtype;
begin
  select * into pay from public.payments where merchant_order_id=p_order for update;
  if not found or pay.invoice_attempt_id is distinct from p_attempt then return false; end if;
  if pay.invoice_state not in ('requesting','creating') then return false; end if;
  select * into o from public.orders where id=pay.order_id for update;
  update public.payments set invoice_state='failed',status='failed',
    invoice_error=left(coalesce(p_reason,'Duitku rejected invoice'),500),updated_at=now()
    where id=pay.id;
  if o.stock_restored_at is null then
    update public.products p set stock=p.stock+i.qty
      from (select product_id,sum(quantity) qty from public.order_items
        where order_id=o.id and product_id is not null group by product_id) i
      where p.id=i.product_id;
    update public.orders set payment_status='failed',order_status='cancelled',
      stock_restored_at=now(),updated_at=now() where id=o.id;
  end if;
  return true;
end;
$$;

create or replace function public.apply_duitku_callback(
  p_order text,p_ref text,p_amount bigint,p_status text,p_payload jsonb
) returns text language plpgsql security definer set search_path=public,pg_temp as $$
declare pay public.payments%rowtype; o public.orders%rowtype;
begin
  select * into pay from public.payments where merchant_order_id=p_order for update;
  if not found then return 'NOT_FOUND'; end if;
  select * into o from public.orders where id=pay.order_id for update;
  if pay.amount<>p_amount or o.total_amount<>p_amount then
    update public.payments set status='needs_review',invoice_state='needs_review',
      callback_payload=p_payload,updated_at=now() where id=pay.id;
    update public.orders set payment_status='needs_review',order_status='payment_review',updated_at=now()
      where id=o.id;
    return 'REVIEW';
  end if;
  if pay.duitku_reference is null then
    update public.payments set status='needs_review',invoice_state='needs_review',
      callback_payload=p_payload,updated_at=now() where id=pay.id;
    update public.orders set payment_status='needs_review',order_status='payment_review',updated_at=now()
      where id=o.id;
    return 'CALLBACK_BEFORE_INVOICE';
  end if;
  if pay.duitku_reference<>p_ref then
    update public.payments set status='needs_review',invoice_state='needs_review',
      callback_payload=p_payload,updated_at=now() where id=pay.id;
    update public.orders set payment_status='needs_review',order_status='payment_review',updated_at=now()
      where id=o.id;
    return 'REFERENCE_MISMATCH';
  end if;
  if pay.status='paid' then
    if p_status='paid' then return 'ALREADY_PAID'; end if;
    update public.payments set status='needs_review',invoice_state='needs_review',
      callback_payload=p_payload,updated_at=now() where id=pay.id;
    update public.orders set payment_status='needs_review',order_status='payment_review',updated_at=now()
      where id=o.id;
    return 'CONFLICT_REVIEW';
  end if;
  if pay.status='failed' and p_status='failed' then return 'ALREADY_FAILED'; end if;
  if pay.status='expired' and p_status='failed' then return 'ALREADY_EXPIRED'; end if;
  if pay.status in ('failed','expired') and p_status='paid' then
    update public.payments set status='needs_review',invoice_state='needs_review',
      callback_payload=p_payload,updated_at=now() where id=pay.id;
    update public.orders set payment_status='needs_review',order_status='payment_review',updated_at=now()
      where id=o.id;
    return 'CONFLICT_REVIEW';
  end if;
  if pay.status='needs_review' or pay.invoice_state='needs_review' then return 'REVIEW'; end if;
  if p_status='paid' then
    update public.payments set status='paid',callback_payload=p_payload,updated_at=now() where id=pay.id;
    update public.orders set payment_status='paid',order_status='processing',updated_at=now() where id=o.id;
    return 'SUCCESS';
  elsif p_status='failed' then
    update public.payments set status='failed',callback_payload=p_payload,updated_at=now() where id=pay.id;
    if o.stock_restored_at is null then
      update public.products p set stock=p.stock+i.qty
        from (select product_id,sum(quantity) qty from public.order_items
          where order_id=o.id and product_id is not null group by product_id) i
        where p.id=i.product_id;
      update public.orders set payment_status='failed',order_status='cancelled',
        stock_restored_at=now(),updated_at=now() where id=o.id;
    end if;
    return 'SUCCESS';
  else
    update public.payments set status='needs_review',invoice_state='needs_review',
      callback_payload=p_payload,updated_at=now() where id=pay.id;
    update public.orders set payment_status='needs_review',order_status='payment_review',updated_at=now()
      where id=o.id;
    return 'REVIEW';
  end if;
end;
$$;

create or replace function public.expire_unpaid_orders()
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare changed integer := 0;
begin
  delete from public.rate_limit_buckets where window_started_at < now() - interval '1 day';
  with expired as (
    select o.id from public.orders o
    join public.payments p on p.order_id=o.id
    where o.payment_status in ('creating','pending','needs_review')
      and o.order_status in ('pending_payment','payment_review')
      and o.invoice_expires_at is not null and o.invoice_expires_at <= now()
      and p.status in ('creating','pending','needs_review')
      and p.invoice_state in ('requesting','ready','unknown','needs_review')
      and o.stock_restored_at is null
      and coalesce(p.callback_payload ? 'resultCode', false) = false
    for update of o,p skip locked
  ), restored as (
    update public.products pr set stock=pr.stock+items.qty
    from (
      select oi.product_id,sum(oi.quantity) qty
      from public.order_items oi join expired e on e.id=oi.order_id
      where oi.product_id is not null group by oi.product_id
    ) items where pr.id=items.product_id
    returning pr.id
  )
  update public.orders o set payment_status='expired',order_status='cancelled',
    stock_restored_at=coalesce(stock_restored_at,now()),updated_at=now()
  from expired e where o.id=e.id and o.stock_restored_at is null;
  get diagnostics changed = row_count;
  update public.payments p set status='expired',invoice_state='expired',updated_at=now()
    from public.orders o where o.id=p.order_id and o.payment_status='expired'
      and p.status in ('creating','pending','needs_review');
  return changed;
end;
$$;

create index if not exists orders_invoice_expiry_idx
  on public.orders(invoice_expires_at) where invoice_expires_at is not null;
create index if not exists payments_order_status_idx on public.payments(order_id,status);

-- pg_cron is supported by Supabase. The scheduled task releases stock after the 60-minute invoice window.
do $
begin
  execute 'create extension if not exists pg_cron with schema pg_catalog';
exception when feature_not_supported or insufficient_privilege or object_not_in_prerequisite_state then
  raise notice 'pg_cron extension unavailable; configure expire_unpaid_orders() in Supabase Cron before accepting orders.';
end;
$;

do $
begin
  perform cron.unschedule(jobid) from cron.job where jobname='asri-expire-unpaid-orders';
  perform cron.schedule('asri-expire-unpaid-orders','*/5 * * * *',
    'select public.expire_unpaid_orders();');
exception when undefined_table or invalid_schema_name or insufficient_privilege then
  raise notice 'pg_cron scheduling unavailable; configure expire_unpaid_orders() in Supabase Cron before accepting orders.';
end;
$;

revoke all on function public.consume_rate_limit(text,text,integer,integer),
  public.create_store_order(text,text,text,text,text,jsonb,bigint,jsonb,text,text),
  public.claim_payment_invoice(text,uuid),
  public.complete_duitku_invoice(text,uuid,text,text,jsonb),
  public.mark_invoice_unknown(text,uuid,text),
  public.fail_invoice_attempt(text,uuid,text),
  public.apply_duitku_callback(text,text,bigint,text,jsonb),
  public.expire_unpaid_orders()
from public,anon,authenticated;
grant execute on function public.consume_rate_limit(text,text,integer,integer),
  public.create_store_order(text,text,text,text,text,jsonb,bigint,jsonb,text,text),
  public.claim_payment_invoice(text,uuid),
  public.complete_duitku_invoice(text,uuid,text,text,jsonb),
  public.mark_invoice_unknown(text,uuid,text),
  public.fail_invoice_attempt(text,uuid,text),
  public.apply_duitku_callback(text,text,bigint,text,jsonb),
  public.expire_unpaid_orders()
to service_role;

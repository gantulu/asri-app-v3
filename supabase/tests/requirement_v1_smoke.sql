create extension if not exists pgtap with schema extensions;
begin;
select extensions.plan(18);

select extensions.has_column('public', 'payments', 'invoice_state', 'payment invoice state is present');
select extensions.has_column('public', 'orders', 'invoice_expires_at', 'order invoice expiry is present');
select extensions.ok(public.consume_rate_limit('checkout', repeat('a', 64), 2, 60), 'first rate-limit request passes');
select extensions.ok(public.consume_rate_limit('checkout', repeat('a', 64), 2, 60), 'second rate-limit request passes');
select extensions.ok(not public.consume_rate_limit('checkout', repeat('a', 64), 2, 60), 'third rate-limit request is blocked');

-- Same idempotency key and payload must return the same order and reserve stock once.
create temporary table test_paid_order as
select public.create_store_order(
  'ASR-TEST-PAID', repeat('5',64), 'Test Customer', 'test@example.com', '+628123456789',
  '{"address":"Test Street","city":"Makassar","postal_code":"90111"}'::jsonb,
  0, '[{"product_id":"10000000-0000-4000-8000-000000000001","quantity":1}]'::jsonb,
  repeat('b',64), repeat('c',64)
) as result;

select extensions.ok((select result ? 'order_id' from test_paid_order), 'checkout creates an order');
select extensions.is((select stock from public.products where id='10000000-0000-4000-8000-000000000001'), 17, 'checkout reserves stock once');
select extensions.is(
  (select result->>'order_id' from test_paid_order),
  (public.create_store_order(
    'ASR-TEST-PAID-REPLAY', repeat('5',64), 'Test Customer', 'test@example.com', '+628123456789',
    '{"address":"Test Street","city":"Makassar","postal_code":"90111"}'::jsonb,
    0, '[{"product_id":"10000000-0000-4000-8000-000000000001","quantity":1}]'::jsonb,
    repeat('b',64), repeat('c',64)
  )->>'order_id'),
  'idempotent replay returns the original order'
);
select extensions.is((select stock from public.products where id='10000000-0000-4000-8000-000000000001'), 17, 'idempotent replay does not reserve stock twice');
select extensions.throws_ok(
  $$select public.create_store_order(
    'ASR-TEST-CONFLICT', repeat('5',64), 'Test Customer', 'test@example.com', '+628123456789',
    '{"address":"Test Street","city":"Makassar","postal_code":"90111"}'::jsonb,
    0, '[{"product_id":"10000000-0000-4000-8000-000000000001","quantity":1}]'::jsonb,
    repeat('b',64), repeat('d',64)
  )$$,
  'P0001', 'IDEMPOTENCY_CONFLICT', 'same key with a different payload is rejected'
);

update public.payments set duitku_reference='REF-PAID',payment_url='https://sandbox.duitku.test/pay',
  status='pending',invoice_state='ready' where merchant_order_id='ASR-TEST-PAID';
select extensions.is(
  public.apply_duitku_callback('ASR-TEST-PAID','REF-PAID',
    (select amount from public.payments where merchant_order_id='ASR-TEST-PAID'),
    'paid','{"resultCode":"00"}'::jsonb),
  'SUCCESS', 'valid paid callback succeeds'
);
select extensions.is(
  public.apply_duitku_callback('ASR-TEST-PAID','REF-PAID',
    (select amount from public.payments where merchant_order_id='ASR-TEST-PAID'),
    'paid','{"resultCode":"00"}'::jsonb),
  'ALREADY_PAID', 'duplicate paid callback is idempotent'
);

-- Failed callback restores stock once, even when the provider retries it.
select public.create_store_order(
  'ASR-TEST-FAILED', repeat('6',64), 'Test Customer', 'test@example.com', '+628123456789',
  '{"address":"Test Street","city":"Makassar","postal_code":"90111"}'::jsonb,
  0, '[{"product_id":"10000000-0000-4000-8000-000000000001","quantity":1}]'::jsonb,
  repeat('e',64), repeat('f',64)
);
update public.payments set duitku_reference='REF-FAILED',payment_url='https://sandbox.duitku.test/pay',
  status='pending',invoice_state='ready' where merchant_order_id='ASR-TEST-FAILED';
select extensions.is(
  public.apply_duitku_callback('ASR-TEST-FAILED','REF-FAILED',
    (select amount from public.payments where merchant_order_id='ASR-TEST-FAILED'),
    'failed','{"resultCode":"01"}'::jsonb),
  'SUCCESS', 'valid failed callback succeeds'
);
select extensions.is(
  public.apply_duitku_callback('ASR-TEST-FAILED','REF-FAILED',
    (select amount from public.payments where merchant_order_id='ASR-TEST-FAILED'),
    'failed','{"resultCode":"01"}'::jsonb),
  'ALREADY_FAILED', 'duplicate failed callback is idempotent'
);
select extensions.is((select stock from public.products where id='10000000-0000-4000-8000-000000000001'), 17, 'failed callback restores stock exactly once');

-- Amount mismatch is held for review and does not restore stock.
select public.create_store_order(
  'ASR-TEST-MISMATCH', repeat('7',64), 'Test Customer', 'test@example.com', '+628123456789',
  '{"address":"Test Street","city":"Makassar","postal_code":"90111"}'::jsonb,
  0, '[{"product_id":"10000000-0000-4000-8000-000000000001","quantity":1}]'::jsonb,
  repeat('2',64), repeat('3',64)
);
update public.payments set duitku_reference='REF-MISMATCH',payment_url='https://sandbox.duitku.test/pay',
  status='pending',invoice_state='ready' where merchant_order_id='ASR-TEST-MISMATCH';
select extensions.is(
  public.apply_duitku_callback('ASR-TEST-MISMATCH','REF-MISMATCH',
    (select amount+1 from public.payments where merchant_order_id='ASR-TEST-MISMATCH'),
    'paid','{"resultCode":"00"}'::jsonb),
  'REVIEW', 'amount mismatch is sent to review'
);
select extensions.is(
  (select status from public.payments where merchant_order_id='ASR-TEST-MISMATCH'),
  'needs_review', 'amount mismatch never marks payment as paid'
);
select extensions.is((select stock from public.products where id='10000000-0000-4000-8000-000000000001'), 16, 'amount mismatch keeps stock reserved for review');

select * from extensions.finish();
rollback;

create extension if not exists pgtap with schema extensions;
begin;
select extensions.plan(5);

select extensions.has_column('public', 'payments', 'invoice_state', 'payment invoice state is present');
select has_column('public', 'orders', 'invoice_expires_at', 'order invoice expiry is present');
select extensions.ok(public.consume_rate_limit('checkout', repeat('a', 64), 2, 60), 'first rate-limit request passes');
select ok(public.consume_rate_limit('checkout', repeat('a', 64), 2, 60), 'second rate-limit request passes');
select ok(not public.consume_rate_limit('checkout', repeat('a', 64), 2, 60), 'third rate-limit request is blocked');

select * from extensions.finish();
rollback;

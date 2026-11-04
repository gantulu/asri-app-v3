# Requirement Perbaikan V1 — Implementation Notes

## Locked decisions

- Guest checkout; no customer authentication.
- IDR only; Duitku POP Sandbox.
- Supabase database is authoritative for product price and stock.
- Stock is reserved atomically when an order is created.
- V1 shipping cost is fixed to Rp0 by the backend. Client-supplied shipping values are ignored.
- Failed payment restores stock once. Ambiguous provider outcomes remain in review.
- Payment retry means a new order, not another invoice for an existing order.
- No admin dashboard, automatic refund, promotion, or shipping aggregator in V1.

## Transaction flow

1. The browser sends a required `Idempotency-Key` header.
2. The Edge Function validates the customer and cart payload.
3. The database serializes requests for the same idempotency hash using a transaction-scoped advisory lock.
4. Product rows are locked in deterministic product-ID order; price and stock are read from PostgreSQL.
5. The database creates one order, payment row, order items, and stock reservation atomically.
6. An invoice claim is acquired under a row lock. Only the first caller can call Duitku.
7. An ambiguous timeout is marked `unknown/needs_review`; the same order cannot create a second invoice.
8. A verified callback applies paid/failed state transitions atomically. Failed payments restore stock once.
9. A callback arriving before invoice reference persistence is held for reconciliation and replayed after the invoice response is persisted.

## Expiry and recovery

- Duitku invoice expiry is requested as 60 minutes.
- The migration schedules `public.expire_unpaid_orders()` every five minutes through pg_cron when the extension is available.
- The expiry job releases stock once for unpaid orders whose invoice window elapsed and which have no recorded callback.
- If pg_cron is unavailable, configure the same SQL function in Supabase Cron before accepting real orders.
- An ambiguous provider result is not retried on the same order. Investigate the provider transaction first; a customer retry creates a new order after the original has been resolved.

## Security and rate limiting

- Set `APP_ORIGINS` to a comma-separated exact allowlist, for example `https://store.example.com,https://www.store.example.com`. `APP_ORIGIN` remains a single-origin fallback.
- Never set a wildcard origin in production.
- Edge Functions use service-role credentials server-side only.
- The browser generates a cryptographically random 256-bit guest token before the checkout request and persists it with the idempotency key. The Edge Function stores only its SHA-256 hash in PostgreSQL and returns the token for customer tracking. The customer can copy the token from the tracking page for use on another device.
- The storefront persists the token in local browser storage to survive page reloads. It is still a bearer credential: customers should keep it private.
- Rate limits are stored in PostgreSQL and keyed by request address plus email/order context. Confirm the trusted forwarding headers supplied by the deployed Supabase Edge proxy before production.
- Duitku callback rate limiting is applied only after signature verification to avoid unauthenticated callers consuming callback quota.

## Duitku POP callback mapping

Based on the official POP documentation:
- Callback `resultCode=00`: paid.
- Callback `resultCode=01`: failed.
- Any other callback code: review only; it does not automatically release stock.
- Redirect query parameters are not trusted for payment state. The storefront reads status from the order-status Edge Function.

Official reference: https://docs.duitku.com/pop/id/

## Local verification

```bash
npm install
npm run build
deno test --allow-env supabase/functions/tests
supabase start
supabase db reset
supabase test db
```

The database smoke test verifies the new migration columns and rate-limit behavior. Full concurrency and provider integration tests still require a running Supabase test environment and Duitku Sandbox credentials.

## Required Edge Function secrets

- `DUITKU_MERCHANT_CODE`
- `DUITKU_API_KEY`
- `DUITKU_CALLBACK_URL`
- `APP_ORIGINS` (recommended) or `APP_ORIGIN`
- Optional `DUITKU_RETURN_URL`

Supabase supplies `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to Edge Functions. Never add these secrets to Vite environment variables or commit them.

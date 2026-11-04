# Asri App V3 — Setup

React, Vite, TypeScript, Supabase and Duitku POP Sandbox. Guest checkout; IDR only.

## Frontend environment

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

## Supabase Edge Function secrets

- `DUITKU_MERCHANT_CODE`
- `DUITKU_API_KEY`
- `DUITKU_CALLBACK_URL`
- `DUITKU_ALLOWED_IPS` — required comma-separated callback source IP allowlist
- `APP_ORIGINS` — comma-separated exact allowed origins (recommended)
- `APP_ORIGIN` — single-origin fallback
- Optional: `DUITKU_RETURN_URL`

Supabase supplies `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Never expose service-role or Duitku secrets to the browser.

## Deploy

1. Configure the Edge Function secrets above.
2. Apply migrations: `supabase db push`.
3. Confirm pg_cron scheduled `asri-expire-unpaid-orders` every five minutes. If pg_cron was unavailable during migration, configure `select public.expire_unpaid_orders();` in Supabase Cron every five minutes.
4. Deploy `create-order-payment`, `duitku-callback`, and `order-status` with `--no-verify-jwt`.
5. Configure the Duitku POP Sandbox callback URL to the deployed `duitku-callback` function.
6. Set frontend environment variables and deploy the Vite application.
7. Insert catalogue products through a trusted operator channel; no admin dashboard is included in V1.

## V1 business and security rules

- Backend sets shipping cost to Rp0; client-supplied shipping values are ignored.
- Product prices and stock are read from PostgreSQL and validated under row locks.
- Checkout requires an idempotency key; concurrent identical requests return the same order.
- Each order can claim only one invoice creation attempt. Ambiguous timeouts enter review and are not automatically retried.
- Payment retry creates a new order.
- Callback source IP must match `DUITKU_ALLOWED_IPS`; for POP Sandbox the official list is `182.23.85.11,182.23.85.12,103.177.101.187,103.177.101.188`.
- Callback signature is HMAC-SHA256 over `merchantCode + amount + merchantOrderId`. Verify that the deployed Edge proxy supplies the original source through `cf-connecting-ip` or `x-real-ip`; otherwise configure the allowlist at the trusted ingress layer.
- POP callback `resultCode=00` is paid and `01` is failed. Other callback codes require review. Redirect query parameters never update payment state.
- Failed payment restores stock once. Unpaid orders expire after the 60-minute invoice window; pg_cron releases reserved stock.
- The browser generates a cryptographically random 256-bit guest token before checkout and stores it with the idempotency key. The backend stores only its SHA-256 hash. The tracking page displays a copyable bearer token so the customer can use it on another device; customers must keep it private.
- CORS uses an exact origin allowlist. Do not use wildcard origins in production.
- Checkout and tracking requests are rate limited in PostgreSQL; callback rate limiting occurs after signature validation.

## Verification

```bash
npm install
npm run build
deno test --allow-env supabase/functions/tests
supabase start
supabase db reset
supabase test db
```

A real Duitku Sandbox transaction and deployed callback test are still required before production readiness. Review [IMPLEMENTATION_V1.md](IMPLEMENTATION_V1.md) for known limitations and recovery operations.

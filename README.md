# Asri App V3

Modern, responsive online storefront built with **React, Vite, TypeScript, Tailwind CSS, Supabase, and Duitku POP Sandbox**.

## Features
- Responsive storefront, product listing and product detail
- Persistent shopping cart and guest checkout
- Supabase PostgreSQL catalogue, orders, order items and payments
- Server-side price/stock validation and atomic stock reservation
- Fixed Rp0 shipping for V1 (backend enforced)
- Idempotent checkout and single-invoice claim per order
- Payment timeout recovery, callback validation, and stock expiry
- Duitku POP Sandbox invoice creation and signed callback
- Private guest order tracking
- IDR currency

## Quick start
1. Copy `.env.example` to `.env.local` and set the Supabase URL and anon key.
2. Install dependencies: `npm install`.
3. Run locally: `npm run dev`.

## Backend setup
See [docs/SETUP.md](docs/SETUP.md) for Supabase migration, Edge Function secrets, deployment, and Duitku Sandbox callback configuration.

Apply migrations with `supabase db push`. Optional starter catalogue: `supabase/seed.sql`.

## Important
Payment credentials and Supabase service-role keys must remain in Supabase Edge Function secrets. V1 shipping is fixed to Rp0 by the backend. Configure exact CORS origins and Supabase Edge Function secrets before deployment. See [docs/IMPLEMENTATION_V1.md](docs/IMPLEMENTATION_V1.md) for transaction recovery, expiry scheduling, tests, and security notes. Sandbox end-to-end verification is required before production.

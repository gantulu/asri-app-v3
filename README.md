# Asri App V3

Modern, responsive online storefront built with **React, Vite, TypeScript, Tailwind CSS, Supabase, and Duitku POP Sandbox**.

## Features
- Responsive storefront, product listing and product detail
- Persistent shopping cart and guest checkout
- Supabase PostgreSQL catalogue, orders, order items and payments
- Server-side price/stock validation and stock reservation
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
Payment credentials and Supabase service-role keys must remain in Supabase Edge Function secrets. Shipping currently defaults to zero until a trusted shipping policy is configured. Sandbox end-to-end verification and operational hardening are required before production.

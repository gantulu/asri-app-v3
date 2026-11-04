# Asri App V3

Modern online storefront built with React, Vite, TypeScript, Tailwind CSS, Supabase, and Duitku POP Sandbox.

## Status

Initial application scaffold is being implemented. Payment credentials and Supabase project configuration must be supplied through deployment secrets; never commit secrets.

## Stack
- React + Vite + TypeScript
- Tailwind CSS
- Supabase PostgreSQL + Edge Functions
- Duitku POP Sandbox

## Local development

1. Copy `.env.example` to `.env.local` and configure the public Supabase URL and anon key.
2. Install dependencies with `npm install`.
3. Start the app with `npm run dev`.

See `docs/IMPLEMENTATION.md` for setup and integration boundaries.
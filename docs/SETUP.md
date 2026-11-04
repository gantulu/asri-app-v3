Asri App V3 — React, Vite, TypeScript, Tailwind CSS, Supabase and Duitku POP Sandbox. Guest checkout; IDR only.

Frontend: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.
Supabase Edge Function secrets: DUITKU_MERCHANT_CODE, DUITKU_API_KEY, DUITKU_CALLBACK_URL, APP_ORIGIN; optional DUITKU_RETURN_URL. Supabase runtime supplies SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.

Deploy: supabase db push; deploy create-order-payment, duitku-callback and order-status with --no-verify-jwt; configure Duitku Sandbox callback URL; configure frontend env and deploy Vite app; insert catalogue products through a trusted operator channel.

Security: service-role and Duitku keys stay server-side; only active product catalogue is public; order/payment tables are private; prices and stock are read from DB and locked transactionally; guest token hash only is stored; callback verifies merchant code and HMAC-SHA256 then checks amount/reference; failed/expired callback restores stock once.

Shipping currently defaults to zero pending a trusted shipping policy. Payment recovery/reconciliation, rate limiting, admin catalogue operations, concurrency tests and Sandbox E2E verification remain before production.
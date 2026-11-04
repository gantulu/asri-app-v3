import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { clientAddress, hash, isOriginAllowed, json, preflight } from '../_shared.ts';

const db = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight(req);
  if (req.method !== 'POST') return json(req, { error: 'Method not allowed' }, 405);
  if (!isOriginAllowed(req)) return json(req, { error: 'Origin not allowed' }, 403);

  try {
    const body = await req.json();
    if (typeof body.order_number !== 'string' || body.order_number.length < 6
      || body.order_number.length > 100 || typeof body.guest_token !== 'string'
      || body.guest_token.length < 32 || body.guest_token.length > 256) {
      return json(req, { error: 'Invalid request' }, 400);
    }

    const rate = await db.rpc('consume_rate_limit', {
      p_scope: 'tracking',
      p_key_hash: await hash(`${clientAddress(req)}:${body.order_number}`),
      p_limit: 20,
      p_window_seconds: 60,
    });
    if (rate.error) return json(req, { error: 'Tracking temporarily unavailable' }, 503);
    if (!rate.data) return json(req, { error: 'Too many tracking attempts' }, 429);

    const { data, error } = await db.rpc('get_guest_order', {
      p_no: body.order_number,
      p_token: await hash(body.guest_token),
    });
    if (error || !data) return json(req, { error: 'Order not found' }, 404);
    return json(req, data);
  } catch {
    return json(req, { error: 'Invalid request' }, 400);
  }
});

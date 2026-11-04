import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { clientAddress, equal, hash, hmac, mapDuitkuCallbackStatus, textResponse } from '../_shared.ts';

const db = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

Deno.serve(async (req) => {
  if (req.method !== 'POST') return textResponse('Method not allowed', 405);
  try {
    const form = await req.formData();
    const value = (key: string) => String(form.get(key) ?? '');
    const merchant = value('merchantCode');
    const amountText = value('amount');
    const order = value('merchantOrderId');
    const signature = value('signature');
    const reference = value('reference');
    const resultCode = value('resultCode');
    const merchantCode = Deno.env.get('DUITKU_MERCHANT_CODE');
    const apiKey = Deno.env.get('DUITKU_API_KEY');

    if (!merchantCode || !apiKey || merchant !== merchantCode || !amountText
      || !/^\d+$/.test(amountText) || !Number.isSafeInteger(Number(amountText))
      || !order || order.length > 100 || !reference || reference.length > 150
      || !signature || !resultCode) {
      return textResponse('Invalid callback', 400);
    }
    const expected = await hmac(apiKey, merchant + amountText + order);
    if (!equal(expected.toLowerCase(), signature.toLowerCase())) {
      return textResponse('Invalid signature', 401);
    }

    const rate = await db.rpc('consume_rate_limit', {
      p_scope: 'callback',
      p_key_hash: await hash(order + ':' + clientAddress(req)),
      p_limit: 30,
      p_window_seconds: 60,
    });
    if (rate.error) return textResponse('Callback temporarily unavailable', 503);
    if (!rate.data) return textResponse('Callback rate limit exceeded', 429);

    // Duitku POP callback contract: 00=Success, 01=Failed. Other values are review-only.
    const status = mapDuitkuCallbackStatus(resultCode);
    const payload = Object.fromEntries(form.entries());
    const { data, error } = await db.rpc('apply_duitku_callback', {
      p_order: order,
      p_ref: reference,
      p_amount: Number(amountText),
      p_status: status,
      p_payload: payload,
    });
    if (error || data === 'NOT_FOUND') return textResponse('Processing failed', 500);
    // A verified but ambiguous callback is persisted for manual review and acknowledged.
    return textResponse('SUCCESS', 200);
  } catch {
    return textResponse('Bad request', 400);
  }
});

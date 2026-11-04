import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  clientAddress, corsFor, hash, hmac, isOriginAllowed, json, preflight,
} from '../_shared.ts';

const db = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

function fail(req: Request, message: string, status: number): Response {
  return json(req, { error: message }, status);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight(req);
  if (req.method !== 'POST') return fail(req, 'Method not allowed', 405);
  if (!isOriginAllowed(req)) return fail(req, 'Origin not allowed', 403);

  try {
    const body = await req.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return fail(req, 'Invalid checkout payload', 400);
    }
    const customerName = typeof body.customer_name === 'string' ? body.customer_name.trim() : '';
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
    const address = typeof body.address === 'string' ? body.address.trim() : '';
    const city = typeof body.city === 'string' ? body.city.trim() : '';
    const postalCode = typeof body.postal_code === 'string' ? body.postal_code.trim() : '';
    const rawItems = body.items;
    const idempotencyKey = req.headers.get('idempotency-key') ?? '';

    if (!customerName || customerName.length > 120 || !email || !phone || !address || !city || !postalCode) {
      return fail(req, 'Checkout data incomplete or invalid', 400);
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 255) {
      return fail(req, 'Invalid email', 400);
    }
    if (!/^[+0-9() .-]{8,30}$/.test(phone) || address.length > 500
      || city.length > 100 || !/^\d{4,10}$/.test(postalCode)) {
      return fail(req, 'Invalid delivery details', 400);
    }
    if (!Array.isArray(rawItems) || rawItems.length < 1 || rawItems.length > 50) {
      return fail(req, 'Cart is empty or too large', 400);
    }
    if (!/^[A-Za-z0-9_-]{16,128}$/.test(idempotencyKey)) {
      return fail(req, 'A valid Idempotency-Key header is required', 400);
    }

    const items = rawItems.map((item: unknown) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        return { product_id: '', quantity: Number.NaN };
      }
      const row = item as Record<string, unknown>;
      return {
        product_id: typeof row.product_id === 'string' ? row.product_id : '',
        quantity: Number(row.quantity),
      };
    });
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (items.some((item) => !uuidPattern.test(item.product_id)
      || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 50)) {
      return fail(req, 'Invalid cart items', 400);
    }
    if (new Set(items.map((item) => item.product_id)).size !== items.length) {
      return fail(req, 'Duplicate product entries are not allowed', 400);
    }

    const allowed = await db.rpc('consume_rate_limit', {
      p_scope: 'checkout',
      p_key_hash: await hash(`${clientAddress(req)}:${email}`),
      p_limit: 8,
      p_window_seconds: 60,
    });
    if (allowed.error) return fail(req, 'Checkout temporarily unavailable', 503);
    if (!allowed.data) return fail(req, 'Too many checkout attempts. Try again shortly.', 429);

    const merchantCode = Deno.env.get('DUITKU_MERCHANT_CODE');
    const apiKey = Deno.env.get('DUITKU_API_KEY');
    const callbackUrl = Deno.env.get('DUITKU_CALLBACK_URL');
    if (!merchantCode || !apiKey || !callbackUrl) return fail(req, 'Duitku is not configured', 503);

    // V1 shipping policy is fixed at Rp0. Ignore any client-supplied shipping amount.
    const token = await hmac(apiKey, `guest:${idempotencyKey}`);
    const orderNumber = `ASR-${crypto.randomUUID().replaceAll('-', '').slice(0, 16).toUpperCase()}`;
    const payloadHash = await hash(JSON.stringify({
      items,
      customer: [customerName, email, phone, address, city, postalCode],
      shipping_cost: 0,
    }));

    const { data: created, error: createError } = await db.rpc('create_store_order', {
      p_no: orderNumber,
      p_token: await hash(token),
      p_name: customerName,
      p_email: email,
      p_phone: phone,
      p_address: { address, city, postal_code: postalCode },
      p_shipping: 0,
      p_items: items,
      p_key: await hash(idempotencyKey),
      p_hash: payloadHash,
    });
    if (createError || !created?.order_id) {
      const message = createError?.message ?? '';
      if (message.includes('IDEMPOTENCY_CONFLICT')) return fail(req, 'Idempotency key payload conflict', 409);
      if (message.includes('INSUFFICIENT_STOCK')) return fail(req, 'Insufficient stock', 409);
      if (message.includes('IDEMPOTENCY_IN_PROGRESS')) return fail(req, 'Checkout is already being processed', 409);
      if (message.includes('DUPLICATE_PRODUCT')) return fail(req, 'Duplicate product entries are not allowed', 400);
      return fail(req, 'Order creation failed', 409);
    }

    const { data: order, error: orderError } = await db.from('orders')
      .select('id,total_amount,order_number')
      .eq('id', created.order_id).single();
    if (orderError || !order) return fail(req, 'Order lookup failed', 500);

    const attemptId = crypto.randomUUID();
    const { data: claim, error: claimError } = await db.rpc('claim_payment_invoice', {
      p_order: order.order_number,
      p_attempt: attemptId,
    });
    if (claimError) return fail(req, 'Could not claim invoice creation', 503);
    if (claim?.state === 'ready') {
      return json(req, { order_number: order.order_number, guest_token: token, payment_url: claim.payment_url });
    }
    if (claim?.state !== 'claimed') {
      if (claim?.state === 'failed') {
        return json(req, {
          order_number: order.order_number, guest_token: token, payment_status: 'failed',
          retry_new_order: true,
          status_message: 'Invoice creation failed. The reserved stock was released; retry checkout to create a new order.',
        });
      }
      const status = claim?.state === 'in_progress' ? 202 : 409;
      return json(req, {
        order_number: order.order_number,
        guest_token: token,
        payment_status: claim?.state ?? 'needs_review',
        status_message: claim?.state === 'in_progress'
          ? 'Invoice creation is still in progress.'
          : 'This order requires payment review. Do not create another invoice for this order.',
      }, status);
    }

    const timestamp = Date.now().toString();
    const signature = await hmac(apiKey, merchantCode + timestamp);
    const appOrigin = (Deno.env.get('APP_ORIGIN') ?? Deno.env.get('APP_ORIGINS') ?? '').split(',')[0].trim();
    const requestPayload = {
      paymentAmount: order.total_amount,
      merchantOrderId: order.order_number,
      productDetails: 'Asri online store',
      email,
      customerVaName: customerName.slice(0, 20),
      phoneNumber: phone,
      callbackUrl,
      returnUrl: Deno.env.get('DUITKU_RETURN_URL') ?? `${appOrigin}/payment/return`,
      expiryPeriod: 60,
    };

    let providerResponse: Response;
    let invoice: Record<string, unknown>;
    try {
      providerResponse = await fetch('https://api-sandbox.duitku.com/api/merchant/createInvoice', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-duitku-timestamp': timestamp,
          'x-duitku-signature': signature,
          'x-duitku-merchantcode': merchantCode,
        },
        body: JSON.stringify(requestPayload),
        signal: AbortSignal.timeout(20000),
      });
      invoice = await providerResponse.json() as Record<string, unknown>;
    } catch {
      await db.rpc('mark_invoice_unknown', {
        p_order: order.order_number, p_attempt: attemptId, p_reason: 'Network timeout or unreadable Duitku response',
      });
      return json(req, {
        order_number: order.order_number, guest_token: token, payment_status: 'needs_review',
        error: 'Invoice result is ambiguous. The order is reserved for review; do not retry payment on this order.',
      }, 202);
    }

    if (providerResponse.ok && typeof invoice.statusCode === 'string' && invoice.statusCode !== '00') {
      await db.rpc('fail_invoice_attempt', {
        p_order: order.order_number, p_attempt: attemptId,
        p_reason: typeof invoice.statusMessage === 'string' ? invoice.statusMessage : 'Duitku rejected invoice',
      });
      return json(req, {
        order_number: order.order_number, guest_token: token, payment_status: 'failed',
        retry_new_order: true,
        status_message: 'Duitku rejected invoice creation. Reserved stock was released; retry checkout to create a new order.',
      });
    }

    if (!providerResponse.ok || invoice.statusCode !== '00'
      || typeof invoice.paymentUrl !== 'string' || typeof invoice.reference !== 'string') {
      await db.rpc('mark_invoice_unknown', {
        p_order: order.order_number, p_attempt: attemptId, p_reason: 'Ambiguous Duitku invoice response',
      });
      return json(req, {
        order_number: order.order_number, guest_token: token, payment_status: 'needs_review',
        error: 'Invoice result is ambiguous. The order is reserved for review; do not retry payment on this order.',
      }, 202);
    }

    const { data: completed, error: completeError } = await db.rpc('complete_duitku_invoice', {
      p_order: order.order_number,
      p_attempt: attemptId,
      p_ref: invoice.reference,
      p_url: invoice.paymentUrl,
      p_response: invoice,
    });
    if (completeError || !completed) {
      await db.rpc('mark_invoice_unknown', {
        p_order: order.order_number, p_attempt: attemptId, p_reason: 'Invoice created but persistence failed',
      });
      return json(req, {
        order_number: order.order_number, guest_token: token, payment_status: 'needs_review',
        status_message: 'Invoice was created but requires payment review. Do not retry this order.',
      }, 202);
    }

    if (completed === 'READY') {
      return json(req, {
        order_number: order.order_number,
        guest_token: token,
        payment_url: invoice.paymentUrl,
      });
    }

    const { data: finalOrder } = await db.from('orders')
      .select('payment_status').eq('id', order.id).maybeSingle();
    if (finalOrder?.payment_status === 'paid') {
      return json(req, {
        order_number: order.order_number, guest_token: token, payment_status: 'paid',
        status_message: 'Payment has already been confirmed.',
      });
    }
    if (finalOrder?.payment_status === 'failed') {
      return json(req, {
        order_number: order.order_number, guest_token: token, payment_status: 'failed',
        status_message: 'Payment failed. Start a new checkout to try again.',
      });
    }
    return json(req, {
      order_number: order.order_number, guest_token: token, payment_status: 'needs_review',
      status_message: 'The payment result needs review. Use order tracking for updates.',
    }, 202);
  } catch {
    return fail(req, 'Checkout failed', 500);
  }
});

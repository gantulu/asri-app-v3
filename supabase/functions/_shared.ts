const configuredOrigins = (Deno.env.get('APP_ORIGINS') ?? Deno.env.get('APP_ORIGIN') ?? '')
  .split(',').map((value) => value.trim()).filter(Boolean);

export function isOriginAllowed(req: Request): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return true; // Server-to-server calls, including Duitku callbacks.
  return configuredOrigins.includes(origin);
}

export function corsFor(req: Request): HeadersInit {
  const origin = req.headers.get('origin');
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, idempotency-key, x-client-info, x-supabase-api-version',
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Vary': 'Origin',
  };
  if (origin && configuredOrigins.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }
  return headers;
}

export function json(req: Request, value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { ...corsFor(req), 'Content-Type': 'application/json' },
  });
}

export function preflight(req: Request): Response {
  if (!isOriginAllowed(req)) return new Response('Origin not allowed', { status: 403 });
  return new Response(null, { status: 204, headers: corsFor(req) });
}

export function textResponse(value: string, status = 200): Response {
  return new Response(value, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}

export async function hmac(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function hash(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function equal(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let index = 0; index < a.length; index += 1) {
    result |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return result === 0;
}

export function clientAddress(req: Request): string {
  // Supabase's edge proxy supplies forwarding headers. Never log this value.
  return req.headers.get('cf-connecting-ip')
    ?? req.headers.get('x-real-ip')
    ?? req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? 'unknown';
}

export function validEmail(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 255
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

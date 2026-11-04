import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { db } from '../../lib';
import { money } from '../../lib';

type OrderStatus = { order_number: string; order_status: string; payment_status: string; total_amount: number; currency: string };

export function TrackOrderPage() {
  const [number, setNumber] = useState('');
  const [token, setToken] = useState('');
  const [result, setResult] = useState<OrderStatus | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('asri:order');
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved) as { order_number?: string; guest_token?: string };
      setNumber(parsed.order_number ?? '');
      setToken(parsed.guest_token ?? '');
    } catch {
      localStorage.removeItem('asri:order');
    }
  }, []);

  async function check(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setResult(null);
    if (!db) { setError('Supabase is not configured.'); return; }
    setBusy(true);
    try {
      const { data, error: invokeError } = await db.functions.invoke<OrderStatus>('order-status', {
        body: { order_number: number.trim(), guest_token: token.trim() },
      });
      if (invokeError || !data) throw new Error(invokeError?.message ?? 'Order not found');
      setResult(data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not retrieve order');
    } finally {
      setBusy(false);
    }
  }

  return <main className="page narrow">
    <small>ORDER CARE</small><h1>Track your <i>order.</i></h1>
    <form className="form" onSubmit={check}>
      <label>Order number<input required value={number} onChange={(event) => setNumber(event.target.value)} /></label>
      <label>Private tracking token<input required value={token} onChange={(event) => setToken(event.target.value)} /></label>
      <button className="button" disabled={busy}>{busy ? 'Checking…' : 'Track order'}</button>
    </form>
    {error && <p className="error" role="alert">{error}</p>}
    {result && <p className="result" role="status">
      {result.order_number} · {result.order_status} · {result.payment_status} · {money(result.total_amount)}
    </p>}
  </main>;
}

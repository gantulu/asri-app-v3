import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { db, configured } from '../../lib';
import { money } from '../../lib';
import { useCart } from '../cart/store';

type Customer = { customer_name: string; email: string; phone: string; address: string; city: string; postal_code: string };
type CheckoutResult = { order_number?: string; guest_token?: string; payment_url?: string; error?: string; status_message?: string; payment_status?: string };

const fields: { key: keyof Customer; label: string; type?: string }[] = [
  { key: 'customer_name', label: 'Full name' },
  { key: 'email', label: 'Email', type: 'email' },
  { key: 'phone', label: 'Phone', type: 'tel' },
  { key: 'address', label: 'Address' },
  { key: 'city', label: 'City' },
  { key: 'postal_code', label: 'Postal code' },
];

export function CheckoutPage() {
  const items = useCart((state) => state.items);
  const clear = useCart((state) => state.clear);
  const [customer, setCustomer] = useState<Customer>({
    customer_name: '', email: '', phone: '', address: '', city: '', postal_code: '',
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [orderReady, setOrderReady] = useState(false);
  const subtotal = items.reduce((sum, item) => sum + item.product.price * item.qty, 0);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (!items.length) { setError('Your bag is empty.'); return; }
    if (!db) { setError('Supabase is not configured.'); return; }
    setBusy(true);
    try {
      let idempotencyKey = localStorage.getItem('asri:checkout-idem');
      if (!idempotencyKey) {
        idempotencyKey = crypto.randomUUID();
        localStorage.setItem('asri:checkout-idem', idempotencyKey);
      }
      const { data, error: invokeError } = await db.functions.invoke<CheckoutResult>('create-order-payment', {
        body: {
          ...customer,
          items: items.map((item) => ({ product_id: item.product.id, quantity: item.qty })),
          shipping_cost: 0,
        },
        headers: { 'Idempotency-Key': idempotencyKey },
      });

      if (data?.order_number && data.guest_token) {
        localStorage.setItem('asri:order', JSON.stringify({
          order_number: data.order_number,
          guest_token: data.guest_token,
        }));
        clear();
        setOrderReady(true);
      }
      if (invokeError || !data) throw new Error(data?.error ?? invokeError?.message ?? 'Checkout failed');
      if (data.payment_url) {
        localStorage.removeItem('asri:checkout-idem');
        window.location.assign(data.payment_url);
        return;
      }
      setError(data.error ?? data.status_message ?? 'Order created. Use the tracking link to check its status.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Checkout failed');
    } finally {
      setBusy(false);
    }
  }

  if (orderReady && error) {
    return <main className="page narrow">
      <small>ORDER CREATED</small><h1>One more <i>step.</i></h1>
      <p>{error}</p>
      <p>Your order details and private tracking token are saved in this browser.</p>
      <Link className="button" to="/track">View order status</Link>
    </main>;
  }

  return <main className="page narrow">
    <small>CHECKOUT</small><h1>Almost <i>yours.</i></h1>
    <div className="checkout-summary"><span>Subtotal</span><b>{money(subtotal)}</b><span>Shipping</span><b>Rp0</b></div>
    <form className="form" onSubmit={submit}>
      <h2>Contact & delivery</h2>
      {fields.map(({ key, label, type }) => (
        <label key={key}>{label}
          <input required type={type ?? 'text'} maxLength={key === 'address' ? 500 : 255}
            value={customer[key]}
            onChange={(event) => setCustomer((current) => ({ ...current, [key]: event.target.value }))} />
        </label>
      ))}
      {error && <p className="error" role="alert">{error}</p>}
      <button className="button" disabled={busy || !configured || !items.length}>
        {busy ? 'Preparing payment…' : 'Continue to payment →'}
      </button>
      {!configured && <small>Set Supabase environment variables and deploy Edge Functions to enable checkout.</small>}
    </form>
  </main>;
}

import { Link } from 'react-router-dom';
import { money } from '../../lib';
import { useCart } from './store';

export function CartPage() {
  const items = useCart((state) => state.items);
  const setQuantity = useCart((state) => state.setQuantity);
  const remove = useCart((state) => state.remove);
  const subtotal = items.reduce((sum, item) => sum + item.product.price * item.qty, 0);
  return (
    <main className="page narrow">
      <small>YOUR BAG</small>
      <h1>A few good <i>things.</i></h1>
      {items.length === 0 ? <p>Your bag is empty. <Link to="/products">Explore collection →</Link></p> : <>
        <div className="cartlist">
          {items.map(({ product, qty }) => (
            <article key={product.id}>
              <img src={product.image_url} alt="" />
              <div><b>{product.name}</b><span>{money(product.price)} each</span>
                <div className="quantity">
                  <button type="button" onClick={() => setQuantity(product.id, qty - 1)} aria-label="Decrease quantity">−</button>
                  <span>{qty}</span>
                  <button type="button" onClick={() => setQuantity(product.id, qty + 1)} disabled={qty >= product.stock} aria-label="Increase quantity">+</button>
                </div>
              </div>
              <button type="button" onClick={() => remove(product.id)}>Remove</button>
            </article>
          ))}
        </div>
        <div className="total"><b>Subtotal</b><strong>{money(subtotal)}</strong><p>Shipping: Rp0 for V1</p>
          <Link className="button" to="/checkout">Continue to checkout →</Link>
        </div>
      </>}
    </main>
  );
}

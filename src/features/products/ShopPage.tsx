import { useEffect, useState } from 'react';
import { ProductCard } from './ProductCard';
import { loadProducts } from '../../services/catalog';
import type { Product } from '../cart/store';

export function ShopPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    loadProducts().then((items) => { if (active) setProducts(items); })
      .catch(() => { if (active) setError('We could not load the collection. Please try again.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  return (
    <main className="page">
      <small>THE COLLECTION</small>
      <h1>Everyday, <i>elevated.</i></h1>
      <p>Useful things, beautiful details. Find the pieces that feel like you.</p>
      {loading && <p role="status">Loading collection…</p>}
      {error && <p className="error" role="alert">{error}</p>}
      {!loading && !error && products.length === 0 && <p>No products are available right now.</p>}
      <div className="grid">{products.map((product) => <ProductCard key={product.id} product={product} />)}</div>
    </main>
  );
}

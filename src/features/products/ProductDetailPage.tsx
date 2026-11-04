import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ShoppingBag } from 'lucide-react';
import { money } from '../../lib';
import { loadProducts } from '../../services/catalog';
import { useCart, type Product } from '../cart/store';

export function ProductDetailPage() {
  const { slug } = useParams();
  const add = useCart((state) => state.add);
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    setLoading(true);
    loadProducts().then((items) => {
      if (active) setProduct(items.find((item) => item.slug === slug) ?? null);
    }).catch(() => { if (active) setError('We could not load this product. Please try again.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [slug]);
  if (loading) return <main className="page" role="status">Loading product…</main>;
  if (error) return <main className="page"><p className="error" role="alert">{error}</p><Link to="/products">Back to collection</Link></main>;
  if (!product) return <main className="page">Product not found. <Link to="/products">Back to collection</Link></main>;
  return (
    <main className="detail">
      <img src={product.image_url} alt={product.name} />
      <div>
        <Link to="/products">← Back to collection</Link>
        <small>{product.category}</small>
        <h1>{product.name}</h1>
        <b>{money(product.price)}</b>
        <p>{product.description}</p>
        <p>{product.stock} available</p>
        <button className="button" disabled={product.stock < 1} onClick={() => add(product)}>
          {product.stock < 1 ? 'Out of stock' : 'Add to bag'} <ShoppingBag />
        </button>
      </div>
    </main>
  );
}

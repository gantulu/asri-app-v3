import { Link } from 'react-router-dom';
import { ArrowUpRight, Plus } from 'lucide-react';
import { money } from '../../lib';
import { useCart, type Product } from '../cart/store';

export function ProductCard({ product }: { product: Product }) {
  const add = useCart((state) => state.add);
  return (
    <article className="card">
      <Link to={`/products/${product.slug}`} className="photo">
        <img src={product.image_url} alt={product.name} loading="lazy" />
        <span><ArrowUpRight /></span>
      </Link>
      <div className="cardrow">
        <div>
          <small>{product.category}</small>
          <Link to={`/products/${product.slug}`}>{product.name}</Link>
          <b>{money(product.price)}</b>
        </div>
        <button onClick={() => add(product)} disabled={product.stock < 1} aria-label={`Add ${product.name} to bag`}>
          <Plus />
        </button>
      </div>
      {product.stock < 1 && <small className="error">Out of stock</small>}
    </article>
  );
}

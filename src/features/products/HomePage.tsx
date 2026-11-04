import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Leaf, ShieldCheck, Truck } from 'lucide-react';
import { ProductCard } from './ProductCard';
import { loadProducts } from '../../services/catalog';
import type { Product } from '../cart/store';

export function HomePage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    loadProducts().then((items) => { if (active) setProducts(items.slice(0, 4)); })
      .catch(() => { if (active) setError('The collection is temporarily unavailable.'); });
    return () => { active = false; };
  }, []);
  return (
    <>
      <section className="hero">
        <div>
          <small>THE ART OF EVERYDAY</small>
          <h1>Make room for<br /><i>the good</i> things.</h1>
          <p>Thoughtful essentials, considered details, and little things that make every day feel a little more like yours.</p>
          <Link className="button" to="/products">Explore collection <ArrowUpRight size={17} /></Link>
          <small className="foot">01 / 03　 Objects for a life well lived</small>
        </div>
        <figure>
          <img src="https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=1400&q=90" alt="Warm lifestyle boutique" />
          <figcaption>CURATED FOR THE EVERYDAY ↗</figcaption>
        </figure>
      </section>
      <div className="ticker">GOOD THINGS TAKE THOUGHT　✳　MADE FOR YOUR EVERYDAY　✳　LESS, BUT BETTER　✳</div>
      <section className="section">
        <div className="sectionhead"><div><small>THE EDIT</small><h2>Find your <i>everyday.</i></h2></div><Link to="/products">View all pieces ↗</Link></div>
        {error && <p className="error" role="alert">{error}</p>}
        {!error && products.length === 0 && <p>Loading the collection…</p>}
        <div className="grid">{products.map((product) => <ProductCard key={product.id} product={product} />)}</div>
      </section>
      <section className="story" id="story">
        <img src="https://images.unsplash.com/photo-1449247709967-d4461a6a6103?w=1200&q=85" alt="Sunlit home" />
        <div><small>A NOTE FROM ASRI</small><h2>Less noise.<br /><i>More meaning.</i></h2><p>We believe the things around us should earn their place. Honest materials, useful forms, and details that feel right — not just for a moment, but for years to come.</p></div>
      </section>
      <section className="values" id="values">
        <small>THE THINGS WE VALUE</small>
        <div>
          <article><Leaf /><h3>Considered by nature</h3><p>Thoughtful materials and details, chosen with care.</p></article>
          <article><ShieldCheck /><h3>Made to matter</h3><p>Useful objects that bring joy to daily rituals.</p></article>
          <article><Truck /><h3>Quality over quantity</h3><p>Fewer, better things. Always.</p></article>
        </div>
      </section>
    </>
  );
}

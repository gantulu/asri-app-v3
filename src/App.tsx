import { Link, Route, Routes } from 'react-router-dom';
import { ShoppingBag } from 'lucide-react';
import { useCart } from './features/cart/store';
import { HomePage } from './features/products/HomePage';
import { ShopPage } from './features/products/ShopPage';
import { ProductDetailPage } from './features/products/ProductDetailPage';
import { CartPage } from './features/cart/CartPage';
import { CheckoutPage } from './features/checkout/CheckoutPage';
import { TrackOrderPage } from './features/orders/TrackOrderPage';

function Header() {
  const count = useCart((state) => state.items.reduce((sum, item) => sum + item.qty, 0));
  return (
    <header>
      <div className="top">A little better, every day — thoughtful essentials for you</div>
      <nav>
        <Link className="logo" to="/">asri<span>.</span></Link>
        <div><Link to="/products">Shop all</Link><a href="/#story">Our story</a><a href="/#values">Our values</a></div>
        <Link to="/cart" className="bag" aria-label={`Shopping bag, ${count} items`}><ShoppingBag size={18} />{count}</Link>
      </nav>
    </header>
  );
}

function Footer() {
  return (
    <footer>
      <Link className="logo" to="/">asri<span>.</span></Link>
      <p>Thoughtful essentials for everyday living.</p>
      <div><Link to="/products">Shop all</Link><Link to="/track">Track order</Link><a href="mailto:hello@asri.store">Contact</a></div>
      <small>© 2026 Asri. Made for everyday.</small>
    </footer>
  );
}

function NotFound() {
  return <main className="page"><h1>Page not found.</h1><Link to="/">Return home →</Link></main>;
}

export default function App() {
  return (
    <>
      <Header />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/products" element={<ShopPage />} />
        <Route path="/products/:slug" element={<ProductDetailPage />} />
        <Route path="/cart" element={<CartPage />} />
        <Route path="/checkout" element={<CheckoutPage />} />
        <Route path="/track" element={<TrackOrderPage />} />
        <Route path="/payment/return" element={<TrackOrderPage />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
      <Footer />
    </>
  );
}

import { db } from '../lib';
import type { Product } from '../features/cart/store';

export const demoProducts: Product[] = [
  { id: 'demo1', slug: 'linen-shirt', name: 'Linen Everyday Shirt', description: 'A relaxed linen shirt made for everyday movement.', price: 289000, image_url: 'https://images.unsplash.com/photo-1598033129183-c4f50c736f10?w=900&q=85', category: 'Apparel', stock: 18 },
  { id: 'demo2', slug: 'canvas-weekender', name: 'Canvas Weekender', description: 'A thoughtful carry-all for everyday and away days.', price: 425000, image_url: 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=900&q=85', category: 'Accessories', stock: 12 },
  { id: 'demo3', slug: 'ceramic-set', name: 'Ceramic Coffee Set', description: 'Handmade ceramics for slower coffee rituals.', price: 195000, image_url: 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=900&q=85', category: 'Living', stock: 24 },
  { id: 'demo4', slug: 'daily-tote', name: 'Daily Essential Tote', description: 'A minimal tote for the things that matter.', price: 159000, image_url: 'https://images.unsplash.com/photo-1544816155-12df9643f363?w=900&q=85', category: 'Accessories', stock: 30 },
];

export async function loadProducts(): Promise<Product[]> {
  if (!db) return demoProducts;
  const { data, error } = await db.from('products')
    .select('id,slug,name,description,price,image_url,category,stock')
    .eq('is_active', true)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Product[];
}

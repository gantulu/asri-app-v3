import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Product = {
  id: string;
  slug: string;
  name: string;
  description: string;
  price: number;
  image_url: string;
  category: string;
  stock: number;
};

type CartItem = { product: Product; qty: number };
type CartState = {
  items: CartItem[];
  add: (product: Product) => void;
  setQuantity: (id: string, quantity: number) => void;
  remove: (id: string) => void;
  clear: () => void;
};

export const useCart = create<CartState>()(persist((set) => ({
  items: [],
  add: (product) => set((state) => {
    const current = state.items.find((item) => item.product.id === product.id);
    if (product.stock < 1) return state;
    return {
      items: current
        ? state.items.map((item) => item.product.id === product.id
          ? { ...item, qty: Math.min(item.qty + 1, product.stock) }
          : item)
        : [...state.items, { product, qty: 1 }],
    };
  }),
  setQuantity: (id, quantity) => set((state) => ({
    items: quantity < 1
      ? state.items.filter((item) => item.product.id !== id)
      : state.items.map((item) => item.product.id === id
        ? { ...item, qty: Math.min(Math.floor(quantity), item.product.stock) }
        : item),
  })),
  remove: (id) => set((state) => ({ items: state.items.filter((item) => item.product.id !== id) })),
  clear: () => set({ items: [] }),
}), { name: 'asri-cart-v2' }));

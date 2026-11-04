insert into public.products(id,slug,name,description,price,image_url,category,stock,is_active) values
('10000000-0000-4000-8000-000000000001','linen-shirt','Linen Everyday Shirt','A relaxed linen shirt made for everyday movement.',289000,'https://images.unsplash.com/photo-1598033129183-c4f50c736f10?w=900&q=85','Apparel',18,true),
('10000000-0000-4000-8000-000000000002','canvas-weekender','Canvas Weekender','A thoughtful carry-all for everyday and away days.',425000,'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=900&q=85','Accessories',12,true),
('10000000-0000-4000-8000-000000000003','ceramic-set','Ceramic Coffee Set','Handmade ceramics for slower coffee rituals.',195000,'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=900&q=85','Living',24,true),
('10000000-0000-4000-8000-000000000004','daily-tote','Daily Essential Tote','A minimal tote for the things that matter.',159000,'https://images.unsplash.com/photo-1544816155-12df9643f363?w=900&q=85','Accessories',30,true)
on conflict(slug) do nothing;

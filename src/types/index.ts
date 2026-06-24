export type Product = {
  id: string;
  title: string;
  description?: string | null;
  base_price: number;
  mrp?: number | null;
  image_url?: string | null;
  categories?: string[] | null;
  badge?: string | null;
  rating?: number | null;
  is_active?: boolean;
  store_id?: string;
  created_at?: string;
};

export type CartItem = {
  productId: string;
  storeId: string;
  title: string;
  price: number;
  quantity: number;
  variantSku?: string;
  variantLabel?: string;
};

export type Order = {
  id: string;
  store_id: string;
  user_id?: string | null;
  items: CartItem[];
  total: number;
  transaction_id?: string | null;
  status: string;
  created_at: string;
  customer_name?: string | null;
  customer_email?: string | null;
  customer_phone?: string | null;
};

export type CustomerDetails = {
  name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
};

export function getProxiedImage(url?: string | null) {
  if (!url) return "/placeholder-product.svg";
  const cleanUrl = url.replace(/^https?:\/\//, "");
  return `https://images.weserv.nl/?url=${cleanUrl}`;
}

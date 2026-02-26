export const getProxiedImage = (url) => {
  if (!url) return "";

  // Remove http:// or https://
  const cleanUrl = url.replace(/^https?:\/\//, "");

  return `https://images.weserv.nl/?url=${cleanUrl}`;
};

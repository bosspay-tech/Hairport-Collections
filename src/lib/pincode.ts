export type PincodeLookup = {
  city: string;
  state: string;
};

type PostalApiOffice = {
  District?: string;
  Name?: string;
  State?: string;
};

type PostalApiResponse = {
  Status: string;
  PostOffice?: PostalApiOffice[];
};

export async function lookupPincode(
  pincode: string,
): Promise<PincodeLookup | null> {
  const clean = pincode.trim();
  if (!/^\d{6}$/.test(clean)) return null;

  const res = await fetch(`https://api.postalpincode.in/pincode/${clean}`);
  if (!res.ok) return null;

  const data = (await res.json()) as PostalApiResponse[];
  const result = data[0];

  if (result?.Status !== "Success" || !result.PostOffice?.length) {
    return null;
  }

  const office = result.PostOffice[0];
  const city = office.District?.trim() || office.Name?.trim() || "";
  const state = office.State?.trim() || "";

  if (!city && !state) return null;

  return { city, state };
}

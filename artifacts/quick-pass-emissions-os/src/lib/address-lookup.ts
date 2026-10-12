import { z } from "zod";
import { addressProof } from "./address-provenance";
import type { AddressSuggestion } from "./contact-address";

const part = z.string().max(500).optional();
const responseSchema = z.object({
  results: z
    .array(
      z.object({
        place_id: z.string().min(1).max(500),
        country_code: part,
        housenumber: part,
        street: part,
        city: part,
        town: part,
        village: part,
        state_code: part,
        state: part,
        postcode: part,
      }),
    )
    .max(20),
});

export async function lookupAddresses(
  query: string,
  signal?: AbortSignal,
): Promise<AddressSuggestion[]> {
  const key = process.env.GEOAPIFY_API_KEY;
  if (!key) throw new Error("Address lookup unavailable.");
  const url = new URL("https://api.geoapify.com/v1/geocode/autocomplete");
  url.search = new URLSearchParams({
    text: query,
    apiKey: key,
    format: "json",
    limit: "5",
    filter: "countrycode:us",
    lang: "en",
  }).toString();
  const response = await fetch(url, {
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.any([AbortSignal.timeout(5000), ...(signal ? [signal] : [])]),
  });
  if (!response.ok) throw new Error("Address lookup unavailable.");
  const parsed = responseSchema.parse(await response.json());
  return parsed.results.flatMap((item) => {
    const address = {
      streetAddress: [item.housenumber, item.street].filter(Boolean).join(" "),
      city: item.city || item.town || item.village || "",
      state: item.state_code || item.state || "",
      postalCode: item.postcode || "",
    };
    // Never replace an entered building address with a city/street-only match.
    if (
      item.country_code !== "us" ||
      !item.housenumber ||
      !item.street ||
      !address.city ||
      !address.state ||
      !address.postalCode ||
      address.streetAddress.length > 1000 ||
      address.city.length > 100 ||
      address.state.length > 100 ||
      address.postalCode.length > 20
    )
      return [];
    return [
      {
        id: item.place_id,
        address,
        label: `${address.streetAddress}, ${address.city}, ${address.state} ${address.postalCode}`,
        proof: addressProof(address, item.place_id),
      },
    ];
  });
}

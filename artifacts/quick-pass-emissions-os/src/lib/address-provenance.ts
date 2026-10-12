import { createHmac, timingSafeEqual } from "node:crypto";
import { addressKeys, baseAddressKeys, type ContactAddress } from "./contact-address";

function base(address: ContactAddress) {
  return baseAddressKeys.map((key) => address[key]?.trim() ?? "");
}
function signature(payload: string) {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error("Address lookup unavailable.");
  return createHmac("sha256", secret).update(`contact-address-v1:${payload}`).digest();
}
export function addressProof(address: ContactAddress, providerId: string) {
  const payload = Buffer.from(JSON.stringify({ base: base(address), providerId })).toString(
    "base64url",
  );
  return `${payload}.${signature(payload).toString("base64url")}`;
}
function selectedProvider(address: ContactAddress, proof?: string) {
  if (!proof) return "";
  try {
    const [payload, encoded, extra] = proof.split(".");
    if (!payload || !encoded || extra) return "";
    const actual = Buffer.from(encoded, "base64url");
    const expected = signature(payload);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return "";
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return typeof data.providerId === "string" &&
      data.providerId.length <= 500 &&
      JSON.stringify(data.base) === JSON.stringify(base(address))
      ? data.providerId
      : "";
  } catch {
    return "";
  }
}
// A selection attests only the street/locality returned by the provider, never deliverability
// or a separately entered apartment/suite. Missing fields preserve existing records.
export function savedContactAddress(
  input: ContactAddress & { addressProof?: string },
  before?: ContactAddress | null,
) {
  const address = Object.fromEntries(
    addressKeys.map((key) => [key, input[key] ?? before?.[key] ?? ""]),
  ) as Required<Pick<ContactAddress, (typeof addressKeys)[number]>>;
  const providerId = selectedProvider(address, input.addressProof);
  const unchanged = before && JSON.stringify(base(before)) === JSON.stringify(base(address));
  const retained =
    unchanged && before.addressSource === "GEOAPIFY_SELECTED" && before.addressProviderId;
  return {
    ...address,
    addressSource: providerId || retained ? "GEOAPIFY_SELECTED" : "MANUAL",
    addressProviderId: providerId || retained || "",
  };
}

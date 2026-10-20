/**
 * Match the identifier recorded by the provider, not a locally certified VIN.
 * Format/check-digit failures do not invalidate a provider inspection.
 * Empty values and obvious placeholders must never join unrelated vehicles.
 */
export function reportedVin(value: string | null | undefined) {
  const vin = value?.trim().toUpperCase();
  if (
    !vin ||
    /^(UNKNOWN|N\/?A|NONE|NULL|INVALID|NOT AVAILABLE|-+)$/i.test(vin) ||
    /^(.)\1+$/.test(vin)
  )
    return null;
  return vin;
}

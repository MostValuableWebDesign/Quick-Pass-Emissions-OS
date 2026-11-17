export function formatInvoiceNumber(year: string, sequence: number) {
  if (!/^\d{4}$/.test(year) || !Number.isSafeInteger(sequence) || sequence < 1) {
    throw new Error("Invoice year and sequence must be valid.");
  }
  return `QP-${year}-${String(sequence).padStart(4, "0")}`;
}

export function isInvoiceNumberForYear(value: string, year: string) {
  return new RegExp(`^QP-${year}-\\d{4,}$`).test(value);
}

export function nextInvoiceSequence(year: string, numbers: string[]) {
  const prefix = `QP-${year}-`;
  const max = numbers.reduce((highest, number) => {
    if (!number.startsWith(prefix)) return highest;
    const suffix = number.slice(prefix.length);
    if (!/^\d{4,}$/.test(suffix)) return highest;
    const sequence = Number(suffix);
    return Number.isSafeInteger(sequence) ? Math.max(highest, sequence) : highest;
  }, 0);
  return max + 1;
}

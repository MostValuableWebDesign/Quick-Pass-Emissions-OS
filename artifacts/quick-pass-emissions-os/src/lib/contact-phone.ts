export const CONTACT_PHONE_PATTERN = String.raw`(?:\+?[0-9]|\([0-9]{1,4}\))[0-9\s\(\)\.\-]{5,24}(?:\s*(?:x|ext\.?|#)\s*[0-9]{1,6})?`;

export const CONTACT_PHONE_TITLE =
  "Enter a valid phone number with 7–15 digits. You may include a country code or extension.";

export function isValidContactPhone(value: string) {
  const phone = value.trim();
  if (!phone) return true;

  const extension = /(?:\s*(?:ext\.?|x|#)\s*[0-9]{1,6})$/i.exec(phone);
  const number = extension ? phone.slice(0, extension.index) : phone;
  return /^\+?\d{7,15}$/.test(number.replace(/[\s().-]/g, ""));
}

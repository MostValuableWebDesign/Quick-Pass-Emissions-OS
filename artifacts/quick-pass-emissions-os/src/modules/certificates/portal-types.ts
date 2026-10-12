export const CERTIFICATE_STATION = "GA102539 - QUICK PASS EMISSIONS INC";
export const CERTIFICATE_ANALYZER = "HT111411";
export const DEFAULT_CERTIFICATE_THRESHOLD = 50;
const LEGACY_DEFAULT_CERTIFICATE_THRESHOLD = 30;
export const CERTIFICATE_ORDER_URL = "https://gadashboard.com/Purchasing/Purchasing.aspx";
export const CERTIFICATE_HISTORY_PATH = "/Purchasing/TAReport.aspx";
export const CERTIFICATE_HISTORY_URL = `https://gadashboard.com${CERTIFICATE_HISTORY_PATH}`;
export type CertificatePortalStatus = {
  balance: number | null;
  checkedAt: string | null;
  threshold: number;
  station: string;
  analyzer: string;
  error?: string;
};
export function certificatesLow(balance: number | null, threshold: number) {
  return balance !== null && balance <= threshold;
}

export function resolveCertificateAlertThreshold(
  currentThreshold: number | null,
  legacyThreshold: number | null,
) {
  if (currentThreshold !== null) return currentThreshold;
  if (legacyThreshold === LEGACY_DEFAULT_CERTIFICATE_THRESHOLD) {
    return DEFAULT_CERTIFICATE_THRESHOLD;
  }
  return legacyThreshold ?? DEFAULT_CERTIFICATE_THRESHOLD;
}

export const CERTIFICATE_STATION = "GA102539 - QUICK PASS EMISSIONS INC";
export const CERTIFICATE_ANALYZER = "HT111411";
export const DEFAULT_CERTIFICATE_THRESHOLD = 30;
export const CERTIFICATE_ORDER_URL = "https://gadashboard.com/Purchasing/Purchasing.aspx";
export type CertificatePortalStatus = {
  balance: number | null;
  checkedAt: string | null;
  threshold: number;
  station: string;
  analyzer: string;
  error?: string;
};
export function certificatesLow(balance: number | null, threshold: number) {
  return balance !== null && balance < threshold;
}

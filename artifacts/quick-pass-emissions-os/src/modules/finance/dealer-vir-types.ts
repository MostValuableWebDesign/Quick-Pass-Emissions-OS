/** Safe review data only: never includes PDF bytes, OCR text, or a raw VIN. */
export type DealerVirRow = {
  id: string;
  source: string;
  date: string;
  certificate: string;
  testNumber: string;
  outcome: "PASS" | "FAIL" | "ABORT" | "UNKNOWN";
  testType: "INITIAL" | "RETEST" | "UNKNOWN";
  feeCents: number | null;
  confidence: number;
  method: "TEXT" | "OCR";
  warnings: string[];
  duplicate: boolean;
  freeRetest: boolean;
};

export type DealerVirPreview = {
  uploadId: string;
  dealershipId: string;
  expiresAt: string;
  rows: DealerVirRow[];
  rateCents: number | null;
  taxBps: number | null;
  termsReady: boolean;
  issueDate: string;
};

export type DealerVirReviewRow = {
  id: string;
  date: string;
  certificate: string;
  testNumber: string;
  outcome: DealerVirRow["outcome"];
  testType: DealerVirRow["testType"];
  billing: "BILL" | "FREE" | "EXCLUDE";
  confirmed: boolean;
};

export type DealerVirCommitInput = {
  uploadId: string;
  dealershipId: string;
  rows: DealerVirReviewRow[];
  createDraft: boolean;
  invoiceNumber: string;
  issueDate: string;
};

export type DealerVirResult = {
  saved: number;
  billable: number;
  free: number;
  skipped: number;
  invoiceId: string | null;
  invoiceNumber: string | null;
};

export type DealerVirResponse<T> = { ok: true; data: T } | { ok: false; message: string };

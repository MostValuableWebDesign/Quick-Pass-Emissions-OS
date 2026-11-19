/** Review data includes only the labelled VIN alongside parsed fields, never PDF/OCR contents. */
export type DealerVirRow = {
  id: string;
  source: string;
  date: string;
  vin: string;
  certificate: string;
  testNumber: string;
  outcome: "PASS" | "FAIL" | "ABORT" | "UNKNOWN";
  testType: "INITIAL" | "RETEST" | "UNKNOWN";
  feeCents: number | null;
  confidence: number;
  method: "TEXT" | "OCR";
  warnings: string[];
  duplicate: boolean;
  savedService?: {
    id: string;
    quantity: number;
    unitCents: number;
    availableForInvoice: boolean;
    invoiceId: string | null;
    invoiceNumber: string | null;
  };
  freeRetest: boolean;
};

export type DealerVirPreview = {
  uploadId: string;
  dealershipId: string;
  fileCount: number;
  uploadedPages: number;
  processedPages: number;
  processedBatches: number;
  expiresAt: string;
  rows: DealerVirRow[];
  rateCents: number | null;
  taxBps: number | null;
  termsReady: boolean;
  issueDate: string;
};

export type DealerVirStart = {
  uploadId: string;
  fileCount: number;
  expectedPages: number;
};

export type DealerVirProgress = {
  processedPages: number;
  expectedPages: number;
  processedBatches: number;
};

export type DealerVirReviewRow = {
  id: string;
  date: string;
  vin: string;
  certificate: string;
  testNumber: string;
  outcome: DealerVirRow["outcome"];
  testType: DealerVirRow["testType"];
  billing: "BILL" | "FREE" | "EXCLUDE";
  confirmed: boolean;
  saveExistingVin: boolean;
  reuseSavedService?: boolean;
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
  vinUpdated?: number;
};

export type DealerVirResponse<T> = { ok: true; data: T } | { ok: false; message: string };

import { z } from "zod";

export const invoiceSnapshotSchema = z.object({
  name: z.string(),
  code: z.string().default(""),
  billingAddress: z.string(),
  phone: z.string().default(""),
  termsDays: z.number().int().min(0).max(365),
  termsReference: z.string(),
  contacts: z.array(z.object({
    name: z.string(),
    email: z.string().default(""),
    phone: z.string().default(""),
    purpose: z.string().default(""),
  })).default([]),
});

export type InvoicePdfDetails = {
  number: string;
  status: string;
  issueDate: string;
  dueDate: string;
  snapshot: z.infer<typeof invoiceSnapshotSchema>;
  notes: string;
  demo: boolean;
  lines: { date: string; description: string; quantity: number; unitCents: number; amountCents: number }[];
  subtotalCents: number;
  taxBps: number;
  taxCents: number;
  totalCents: number;
  paidCents: number;
  remainingCents: number;
};

export type InvoiceEmailDetails = {
  number: string;
  dealershipName: string;
  dueDate: string;
  serviceDates: string[];
  remainingCents: number;
};

export type InvoiceEmailSignature = {
  contactName: string;
  paymentInstructions: string;
  senderName: string;
  senderPhone: string;
  senderEmail: string;
};

export function invoiceDate(date: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC", month: "short", day: "numeric", year: "numeric",
  }).format(new Date(`${date}T12:00:00.000Z`));
}

export function invoiceMoney(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

export function invoiceServicePeriod(dates: string[]) {
  const sorted = [...new Set(dates)].sort();
  if (!sorted.length) return "the invoiced service period";
  const first = sorted[0];
  const last = sorted.at(-1)!;
  return first === last ? invoiceDate(first) : `${invoiceDate(first)} to ${invoiceDate(last)}`;
}

export function buildInvoiceEmail(invoice: InvoiceEmailDetails, signature: InvoiceEmailSignature) {
  return {
    subject: `Quick Pass Emissions — Payment Due for ${invoice.dealershipName}`,
    body: [
      `Hi ${signature.contactName.trim()},`,
      "",
      `Attached is your invoice for emissions testing services provided to ${invoice.dealershipName} during ${invoiceServicePeriod(invoice.serviceDates)}.`,
      "",
      `- Invoice number: ${invoice.number}`,
      `- Outstanding balance: ${invoiceMoney(invoice.remainingCents)}`,
      `- Payment due date: ${invoiceDate(invoice.dueDate)}`,
      "",
      `Please submit payment using ${signature.paymentInstructions.trim()}. If payment has already been sent, please reply with the payment date and reference number so we can update your account.`,
      "",
      "If you have any questions or need a breakdown of the vehicles tested, please let us know.",
      "",
      "Thank you for your business. We appreciate the opportunity to serve your dealership.",
      "",
      "Best,",
      signature.senderName.trim(),
      "Quick Pass Emissions",
      ...(signature.senderPhone.trim() ? [signature.senderPhone.trim()] : []),
      signature.senderEmail.trim(),
    ].join("\n"),
  };
}

export function gmailInvoiceDraftUrl(recipient: string, subject: string, body: string) {
  const query = new URLSearchParams({ view: "cm", fs: "1", to: recipient.trim(), su: subject, body });
  return `https://mail.google.com/mail/?${query.toString()}`;
}

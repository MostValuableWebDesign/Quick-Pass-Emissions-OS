import type { dashboardSnapshot } from "../dashboard/service";
export type DailySnapshot = Awaited<ReturnType<typeof dashboardSnapshot>>;
const usd = (n: number | null) =>
  n === null
    ? "Unavailable — incomplete inputs"
    : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n / 100);
export const escapeEmail = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );

const emailPalette = {
  navy: "#00345b",
  blue: "#0078bd",
  link: "#005a8d",
  background: "#f8fafc",
  surface: "#ffffff",
  text: "#343b3f",
  muted: "#586166",
  line: "#d8e2eb",
  soft: "#f5f8fb",
};

export function renderOwnerEmail(snapshot: DailySnapshot, generatedAt: Date, reportUrl?: string) {
  const s = snapshot;
  const subject = `Quick Pass Emissions — Daily owner summary · ${s.today}`;
  const sections: { title: string; lines: string[] }[] = [
    {
      title: "Business snapshot",
      lines: [
        ...(s.demo ? ["DEMO DATA PRESENT — do not treat sample records as business facts."] : []),
        `Tests performed: ${s.tests.performed ?? "Unavailable — no imported station coverage"}`,
        `Commission-eligible tests: ${s.tests.performed === null ? "Unavailable" : s.tests.eligible}; awaiting review: ${s.tests.performed === null ? "Unavailable" : s.tests.awaitingReview}`,
        `Approved employee test counts: ${s.tests.approvedEmployeeCounts} (separate approved source)`,
        `Dealer invoices billed: ${usd(s.revenue.billed)}`,
        `Dealer and rental receipts recorded: ${usd(s.revenue.received)} (not all business receipts)`,
        `Retail revenue estimate: ${usd(s.revenue.retailEstimate)}; unpriced retail tests: ${s.tests.performed === null ? "Unavailable" : s.revenue.unpricedRetail}`,
        `Other revenue estimates: ${usd(s.revenue.otherEstimates)}`,
        `Verified manual revenue: ${usd(s.revenue.verifiedManual)}; unverified manual revenue: ${usd(s.revenue.unverifiedManual)}`,
      ],
    },
    {
      title: "Employee gross pay so far",
      lines: [
        `Base pay: ${usd(s.pay.baseCents)}; commissions: ${usd(s.pay.commissionCents)}`,
        `Gross pay: ${usd(s.pay.grossCents)}`,
        `Known base pay: ${usd(s.pay.knownBaseCents)}; known commissions: ${usd(s.pay.knownCommissionCents)} (partial when inputs are missing)`,
        ...s.pay.missing.slice(0, 15).map((p) => `${p.name}: missing ${p.missing.join(", ")}`),
        ...(s.pay.missing.length > 15
          ? [`${s.pay.missing.length - 15} additional employees need payroll review.`]
          : []),
        ...(s.pay.employees === 0 ? ["No employee payroll records available."] : []),
      ],
    },
    {
      title: "Needs attention — unresolved at generation",
      lines: [
        ...s.attention
          .slice(0, 15)
          .map((a) => `${a.severity.toUpperCase()}: ${a.title} — ${a.detail}`),
        ...(s.attention.length === 0 ? ["No configured attention items found."] : []),
        ...(s.attention.length > 15
          ? [`${s.attention.length - 15} additional items in the app.`]
          : []),
        ...(s.unknownInventory
          ? [`${s.unknownInventory} inventory balances or reorder settings are unavailable.`]
          : []),
      ],
    },
  ];
  const captured = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(generatedAt);
  const note = `Report snapshot captured ${captured} Eastern. Later entries are not included. Missing inputs stay unavailable. Estimates, billing and receipts are separate measures; do not add them together. This is not profit or frozen accounting books.`;
  const text = [
    subject,
    note,
    ...sections.flatMap((s) => ["", s.title, ...s.lines]),
    ...(reportUrl ? ["", `Open saved report: ${reportUrl}`] : []),
  ].join("\n");
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escapeEmail(subject)}</title></head><body style="margin:0;padding:1px;background:${emailPalette.background};color:${emailPalette.text};font-family:Arial,sans-serif"><main style="max-width:640px;margin:24px auto;padding:28px;background:${emailPalette.surface};border:1px solid ${emailPalette.line};border-top:5px solid ${emailPalette.navy}"><p style="margin:0 0 8px;color:${emailPalette.blue};font-size:12px;font-weight:bold;letter-spacing:1px">QUICK PASS EMISSIONS</p><h1 style="margin:0;color:${emailPalette.navy};font-size:25px">Daily owner summary · ${escapeEmail(s.today)}</h1><p style="margin:16px 0;color:${emailPalette.muted};font-size:13px;line-height:1.55">${escapeEmail(note)}</p>${sections.map((s) => `<h2 style="margin:28px 0 10px;padding-bottom:8px;border-bottom:1px solid ${emailPalette.line};color:${emailPalette.navy};font-size:19px">${escapeEmail(s.title)}</h2><ul style="margin:0;padding-left:22px">${s.lines.map((line) => `<li style="margin:10px 0;color:${emailPalette.text};line-height:1.5">${escapeEmail(line)}</li>`).join("")}</ul>`).join("")}${reportUrl ? `<p style="margin-top:24px;padding:14px;background:${emailPalette.soft}"><a style="color:${emailPalette.link};font-weight:bold" href="${escapeEmail(reportUrl)}">Open saved report in Quick Pass</a></p>` : ""}</main></body></html>`;
  return { subject, text, html };
}

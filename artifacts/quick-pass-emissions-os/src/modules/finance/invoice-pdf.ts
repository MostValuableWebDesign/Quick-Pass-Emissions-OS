import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  PDFDocument,
  StandardFonts,
  PDFName,
  PDFNumber,
  PDFString,
  rgb,
  type PDFFont,
  type PDFImage,
  type PDFPage,
} from "pdf-lib";
import { invoiceDocumentPalette, invoiceIssuer, type InvoicePdfDetails } from "./invoice-document";
import { invoiceDate, invoiceMoney, invoiceServicePeriod } from "./invoice-email";
import { dealershipInvoiceBrand, type DealershipInvoiceBrand } from "./dealership-invoice-branding";

const pdfColor = (hex: string) => {
  const value = hex.replace("#", "");
  return rgb(
    Number.parseInt(value.slice(0, 2), 16) / 255,
    Number.parseInt(value.slice(2, 4), 16) / 255,
    Number.parseInt(value.slice(4, 6), 16) / 255,
  );
};
const navy = pdfColor(invoiceDocumentPalette.navy);
const blue = pdfColor(invoiceDocumentPalette.blue);
const ink = pdfColor(invoiceDocumentPalette.text);
const muted = pdfColor(invoiceDocumentPalette.muted);
const lineColor = pdfColor(invoiceDocumentPalette.line);
const soft = pdfColor(invoiceDocumentPalette.soft);
const paper = rgb(1, 1, 1);
const warnFill = pdfColor("#FFF6E0");
const warnInk = pdfColor("#7A4B00");

const W = 612;
const H = 792;
const X = 42;
const CW = 528;
const BOTTOM = 62;

function wrap(text: string, font: PDFFont, size: number, width: number) {
  const lines: string[] = [];
  for (const paragraph of text.replace(/\r/g, "").split("\n")) {
    let current = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= width) {
        current = candidate;
        continue;
      }
      if (current) lines.push(current);
      current = "";
      for (const character of word) {
        if (font.widthOfTextAtSize(current + character, size) > width && current) {
          lines.push(current);
          current = "";
        }
        current += character;
      }
    }
    lines.push(current);
  }
  return lines;
}

function fit(text: string, font: PDFFont, size: number, width: number) {
  if (font.widthOfTextAtSize(text, size) <= width) return text;
  let out = text;
  while (out.length > 1 && font.widthOfTextAtSize(`${out}...`, size) > width)
    out = out.slice(0, -1);
  return `${out.trimEnd()}...`;
}

/** Reads only the reviewed, bundled logo from public/. Never fetches remotely. */
async function loadLogo(document: PDFDocument, brand: DealershipInvoiceBrand | null) {
  if (!brand || !/^\/images\/invoice-dealerships\/[a-z0-9-]+\.png$/.test(brand.logo)) return null;
  // A missing configured asset is a packaging error, not permission to silently lose customer branding.
  const bytes = await readFile(path.join(process.cwd(), "public", brand.logo));
  return document.embedPng(bytes);
}

function domain(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function safePaymentUrl(value: string) {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !/^\/api\/invoices\/pay\/[a-f0-9-]{72}$/.test(url.pathname)
  )
    throw new Error("Invoice payment URL is not a valid secure payment link.");
  return url.toString();
}

export async function createInvoicePdf(invoice: InvoicePdfDetails) {
  const document = await PDFDocument.create();
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const snap = invoice.snapshot;
  const brand = dealershipInvoiceBrand(snap.name);
  const logo: PDFImage | null = await loadLogo(document, brand);
  const accent = brand ? pdfColor(brand.accent) : blue;
  const heading = brand ? pdfColor(brand.heading) : navy;
  const tint = brand ? pdfColor(brand.tint) : soft;

  document.setTitle(`Quick Pass Emissions — Invoice ${invoice.number}`);
  document.setAuthor("Quick Pass Emissions");
  document.setSubject(`Invoice for ${snap.name}`);

  let page: PDFPage = document.addPage([W, H]);
  let y = 0;

  const text = (t: string, x: number, yy: number, size: number, font = regular, color = ink) =>
    page.drawText(t, { x, y: yy, size, font, color });
  const rightText = (t: string, x: number, yy: number, size = 9, font = regular, color = ink) =>
    page.drawText(t, { x: x - font.widthOfTextAtSize(t, size), y: yy, size, font, color });

  const continuationHeader = () => {
    page.drawRectangle({ x: 0, y: H - 6, width: W, height: 6, color: navy });
    page.drawRectangle({ x: X, y: H - 46, width: 3, height: 18, color: accent });
    text("QUICK PASS EMISSIONS", X + 10, H - 36, 10, bold, navy);
    text(`Invoice ${invoice.number} (continued)`, X + 10, H - 46, 8, regular, muted);
    rightText("BILL TO", X + CW, H - 34, 7, bold, accent);
    rightText(fit(snap.name, bold, 9, 260), X + CW, H - 46, 9, bold, heading);
    page.drawLine({
      start: { x: X, y: H - 58 },
      end: { x: X + CW, y: H - 58 },
      thickness: 0.5,
      color: lineColor,
    });
    y = H - 82;
  };
  const nextPage = () => {
    page = document.addPage([W, H]);
    continuationHeader();
  };
  const room = (height: number) => {
    if (y - height >= BOTTOM) return false;
    nextPage();
    return true;
  };
  const paragraph = (t: string, size = 10, font = regular, color = ink, indent = 0) => {
    for (const line of wrap(t, font, size, CW - indent)) {
      room(size + 5);
      text(line, X + indent, y, size, font, color);
      y -= size + 5;
    }
  };
  const sectionLabel = (label: string) => {
    room(34);
    y -= 8;
    page.drawRectangle({ x: X, y: y - 2, width: 3, height: 11, color: accent });
    text(label, X + 9, y, 8.5, bold, heading);
    y -= 17;
  };
  const paymentLink = (url: string, label: string) => {
    const width = bold.widthOfTextAtSize(label, 9);
    text(label, X + 9, y, 9, bold, blue);
    page.drawLine({
      start: { x: X + 9, y: y - 1.5 },
      end: { x: X + 9 + width, y: y - 1.5 },
      thickness: 0.5,
      color: blue,
    });
    const annotation = document.context.obj({
      Type: PDFName.of("Annot"),
      Subtype: PDFName.of("Link"),
      Rect: [
        PDFNumber.of(X + 8),
        PDFNumber.of(y - 3),
        PDFNumber.of(X + 11 + width),
        PDFNumber.of(y + 11),
      ],
      Border: [PDFNumber.of(0), PDFNumber.of(0), PDFNumber.of(0)],
      A: {
        Type: PDFName.of("Action"),
        S: PDFName.of("URI"),
        URI: PDFString.of(url),
      },
    });
    page.node.addAnnot(document.context.register(annotation));
  };

  // ---------- Issuer masthead (Quick Pass always issues) ----------
  page.drawRectangle({ x: 0, y: H - 104, width: W, height: 104, color: navy });
  page.drawRectangle({ x: 0, y: H - 108, width: W, height: 4, color: accent });
  text("ISSUED BY", X, H - 38, 7, bold, pdfColor("#9FC3DE"));
  text("QUICK PASS EMISSIONS", X, H - 60, 20, bold, paper);
  text(
    "Emissions testing services for dealership partners",
    X,
    H - 76,
    8.5,
    regular,
    pdfColor("#C7DCEC"),
  );
  text(
    `${invoiceIssuer.email}  ·  ${invoiceIssuer.website}`,
    X,
    H - 91,
    7.5,
    regular,
    pdfColor("#C7DCEC"),
  );
  rightText("INVOICE", X + CW, H - 46, 24, bold, paper);
  rightText(
    fit(`No. ${invoice.number}`, bold, 11, 240),
    X + CW,
    H - 64,
    11,
    bold,
    pdfColor("#C7DCEC"),
  );
  const statusLabel = invoice.status.toUpperCase();
  const sw = bold.widthOfTextAtSize(statusLabel, 7.5) + 16;
  page.drawRectangle({
    x: X + CW - sw,
    y: H - 90,
    width: sw,
    height: 15,
    color: paper,
    opacity: 0.14,
  });
  rightText(statusLabel, X + CW - 8, H - 85, 7.5, bold, paper);
  y = H - 130;

  if (invoice.demo) {
    page.drawRectangle({
      x: X,
      y: y - 8,
      width: CW,
      height: 22,
      color: warnFill,
      borderColor: pdfColor("#E8B44A"),
      borderWidth: 0.6,
    });
    text(
      "DEMONSTRATION — NOT A REAL BILL. Do not remit payment for this document.",
      X + 10,
      y,
      8.5,
      bold,
      warnInk,
    );
    y -= 32;
  }

  // ---------- Bill-to card (dealership identity) + invoice facts ----------
  const leftW = 300;
  const pad = 14;
  const nameLines = wrap(snap.name, bold, 14, leftW - pad * 2);
  const addrLines = wrap(snap.billingAddress, regular, 9.5, leftW - pad * 2);
  let logoBox: { w: number; h: number; iw: number; ih: number } | null = null;
  if (logo) {
    const maxW = 176,
      maxH = 50,
      inner = 8;
    const s = Math.min((maxW - inner * 2) / logo.width, (maxH - inner * 2) / logo.height);
    const iw = logo.width * s,
      ih = logo.height * s;
    logoBox = { w: Math.max(iw + inner * 2, 90), h: ih + inner * 2, iw, ih };
  }
  const leftH =
    pad +
    12 +
    (logoBox ? logoBox.h + 12 : 0) +
    nameLines.length * 17 +
    4 +
    addrLines.length * 13 +
    (snap.phone ? 13 : 0) +
    (brand ? 16 : 0) +
    pad;

  const facts: [string, string][] = [
    ["Issue date", invoiceDate(invoice.issueDate)],
    ["Due date", invoiceDate(invoice.dueDate)],
    ["Service period", invoiceServicePeriod(invoice.lines.map((l) => l.date))],
    ["Payment terms", `Net ${snap.termsDays} days`],
  ];
  if (snap.termsReference) facts.push(["Terms reference", snap.termsReference]);
  const factX = X + leftW + 22;
  const factW = X + CW - factX;
  const factRows = facts.map(([k, v]) => [k, wrap(v, bold, 9, factW - 92)] as const);
  const rightH = factRows.reduce((sum, [, v]) => sum + v.length * 12 + 7, 0) + 60;
  const cardH = Math.max(leftH, rightH);
  const top = y + 6;

  page.drawRectangle({ x: X, y: top - cardH, width: leftW, height: cardH, color: tint });
  page.drawRectangle({ x: X, y: top - cardH, width: 4, height: cardH, color: accent });
  let ly = top - pad - 6;
  text("BILL TO  ·  CUSTOMER", X + pad, ly, 7, bold, heading);
  ly -= 12;
  if (logo && logoBox && brand) {
    page.drawRectangle({
      x: X + pad,
      y: ly - logoBox.h,
      width: logoBox.w,
      height: logoBox.h,
      color: pdfColor(brand.logoBackground),
      borderColor: lineColor,
      borderWidth: 0.5,
    });
    page.drawImage(logo, {
      x: X + pad + (logoBox.w - logoBox.iw) / 2,
      y: ly - logoBox.h + (logoBox.h - logoBox.ih) / 2,
      width: logoBox.iw,
      height: logoBox.ih,
    });
    ly -= logoBox.h + 12;
  }
  for (const l of nameLines) {
    ly -= 13;
    text(l, X + pad, ly, 14, bold, heading);
    ly -= 4;
  }
  ly -= 4;
  for (const l of addrLines) {
    ly -= 10;
    text(l, X + pad, ly, 9.5, regular, ink);
    ly -= 3;
  }
  if (snap.phone) {
    ly -= 10;
    text(fit(snap.phone, regular, 9.5, leftW - pad * 2), X + pad, ly, 9.5, regular, ink);
    ly -= 3;
  }
  if (brand) {
    ly -= 13;
    text(`Dealership site: ${domain(brand.website)}`, X + pad, ly, 7.5, regular, muted);
  }

  // facts column
  let fy = top - 14;
  text("INVOICE DETAILS", factX, fy, 7, bold, muted);
  fy -= 16;
  for (const [k, v] of factRows) {
    text(k, factX, fy, 8.5, regular, muted);
    for (const [n, l] of v.entries()) rightText(l, X + CW, fy - n * 12, 9, bold, ink);
    fy -= v.length * 12 + 7;
  }
  const due = invoiceMoney(invoice.remainingCents);
  page.drawRectangle({ x: factX, y: top - cardH, width: factW, height: 34, color: heading });
  text("BALANCE DUE", factX + 10, top - cardH + 13, 7.5, bold, paper);
  rightText(due, X + CW - 10, top - cardH + 11, 14, bold, paper);
  y = top - cardH - 16;

  // ---------- Contacts ----------
  if (snap.contacts.length) {
    sectionLabel("BILLING CONTACTS");
    for (const c of snap.contacts) {
      const detail = [c.purpose, c.email, c.phone].filter(Boolean).join("  ·  ");
      const nameW = 150;
      const nl = wrap(c.name, bold, 9, nameW);
      const dl = wrap(detail, regular, 8.5, CW - nameW - 20);
      const h = Math.max(nl.length, dl.length, 1) * 12 + 2;
      room(h);
      nl.forEach((l, n) => text(l, X + 9, y - n * 12, 9, bold, ink));
      dl.forEach((l, n) => text(l, X + nameW + 20, y - n * 12, 8.5, regular, muted));
      y -= h;
    }
  }

  // ---------- Line items ----------
  y -= 10;
  const cols = { date: X + 10, desc: X + 88, qty: X + 352, rate: X + 434, amt: X + CW - 10 };
  const tableHeading = () => {
    room(30);
    page.drawRectangle({ x: X, y: y - 8, width: CW, height: 22, color: heading });
    text("SERVICE DATE", cols.date, y, 7.5, bold, paper);
    text("DESCRIPTION", cols.desc, y, 7.5, bold, paper);
    rightText("QTY", cols.qty, y, 7.5, bold, paper);
    rightText("RATE", cols.rate, y, 7.5, bold, paper);
    rightText("AMOUNT", cols.amt, y, 7.5, bold, paper);
    y -= 26;
  };
  tableHeading();
  if (!invoice.lines.length) {
    text("No line items on this invoice.", cols.desc, y, 9, regular, muted);
    y -= 20;
  }
  for (const [index, item] of invoice.lines.entries()) {
    const description = wrap(item.description, regular, 9, 225);
    const height = Math.max(1, description.length) * 12 + 10;
    if (room(height)) tableHeading();
    if (index % 2 === 1)
      page.drawRectangle({ x: X, y: y - height + 10, width: CW, height, color: tint });
    text(invoiceDate(item.date), cols.date, y, 8.5, regular, ink);
    description.forEach((l, n) => text(l, cols.desc, y - n * 12, 9, regular, ink));
    rightText(String(item.quantity), cols.qty, y, 9);
    rightText(invoiceMoney(item.unitCents), cols.rate, y, 9);
    rightText(invoiceMoney(item.amountCents), cols.amt, y, 9, bold, ink);
    y -= height;
  }
  page.drawLine({
    start: { x: X, y: y + 8 },
    end: { x: X + CW, y: y + 8 },
    thickness: 0.8,
    color: heading,
  });

  // ---------- Totals ----------
  room(150);
  y -= 10;
  const tx = X + CW - 250;
  const rows: [string, number, boolean][] = [
    ["Subtotal", invoice.subtotalCents, false],
    [`Tax (${invoice.taxBps / 100}%)`, invoice.taxCents, false],
    ["Invoice total", invoice.totalCents, true],
    ["Received net payments", invoice.paidCents, false],
  ];
  for (const [label, value, em] of rows) {
    text(label, tx + 10, y, 9.5, em ? bold : regular, em ? heading : ink);
    rightText(invoiceMoney(value), X + CW - 10, y, 9.5, em ? bold : regular, em ? heading : ink);
    if (em)
      page.drawLine({
        start: { x: tx, y: y - 7 },
        end: { x: X + CW, y: y - 7 },
        thickness: 0.5,
        color: lineColor,
      });
    y -= 20;
  }
  page.drawRectangle({ x: tx, y: y - 12, width: 250, height: 30, color: heading });
  page.drawRectangle({ x: tx, y: y - 12, width: 4, height: 30, color: accent });
  text("OUTSTANDING BALANCE", tx + 14, y, 8.5, bold, paper);
  rightText(invoiceMoney(invoice.remainingCents), X + CW - 10, y - 2, 13, bold, paper);
  text(`Please reference invoice ${invoice.number}`, X, y + 40, 8, regular, muted);
  text(`with payment. Due ${invoiceDate(invoice.dueDate)}.`, X, y + 28, 8, regular, muted);
  y -= 34;

  if (invoice.paymentUrl && invoice.remainingCents > 0 && invoice.status !== "VOIDED") {
    const url = safePaymentUrl(invoice.paymentUrl);
    sectionLabel("PAY ONLINE");
    paymentLink(url, "Pay this invoice securely online");
    y -= 15;
    paragraph(
      "The payment page checks the current balance before opening Stripe.",
      8.5,
      regular,
      muted,
    );
  }

  if (invoice.notes) {
    sectionLabel("INVOICE NOTES");
    paragraph(invoice.notes, 9.5, regular, ink, 9);
  }

  // ---------- Repeated footer ----------
  const pages = document.getPages();
  for (const [index, sheet] of pages.entries()) {
    sheet.drawLine({
      start: { x: X, y: 44 },
      end: { x: X + CW, y: 44 },
      thickness: 0.5,
      color: lineColor,
    });
    sheet.drawRectangle({ x: X, y: 43.5, width: 40, height: 1.5, color: accent });
    const left = `${invoiceIssuer.name}  |  ${invoiceIssuer.email}  |  ${invoiceIssuer.website}`;
    sheet.drawText(fit(left, regular, 7.5, 250), {
      x: X,
      y: 30,
      size: 7.5,
      font: regular,
      color: muted,
    });
    const mid = fit(`Prepared for ${snap.name}`, regular, 7.5, 180);
    sheet.drawText(mid, { x: X + 260, y: 30, size: 7.5, font: regular, color: muted });
    const pg = `Page ${index + 1} of ${pages.length}`;
    sheet.drawText(pg, {
      x: X + CW - bold.widthOfTextAtSize(pg, 7.5),
      y: 30,
      size: 7.5,
      font: bold,
      color: navy,
    });
  }
  return document.save();
}

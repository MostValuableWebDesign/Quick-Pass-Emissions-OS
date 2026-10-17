import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import { invoiceDocumentPalette, type InvoicePdfDetails } from "./invoice-document";
import { invoiceDate, invoiceMoney, invoiceServicePeriod } from "./invoice-email";

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

export async function createInvoicePdf(invoice: InvoicePdfDetails) {
  const document = await PDFDocument.create();
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  document.setTitle(`Quick Pass Emissions — Invoice ${invoice.number}`);
  document.setAuthor("Quick Pass Emissions");
  document.setSubject(`Invoice for ${invoice.snapshot.name}`);
  let page = document.addPage([612, 792]);
  let y = 748;

  const nextPage = () => {
    page = document.addPage([612, 792]);
    y = 748;
    for (const text of wrap(`Quick Pass Emissions | Invoice ${invoice.number}`, bold, 11, 528)) {
      page.drawText(text, { x: 42, y, font: bold, size: 11, color: navy });
      y -= 16;
    }
    y -= 12;
  };
  const room = (height: number) => {
    if (y - height >= 54) return false;
    nextPage();
    return true;
  };
  const paragraph = (text: string, size = 10, font = regular, color = ink) => {
    for (const textLine of wrap(text, font, size, 528)) {
      room(size + 6);
      page.drawText(textLine, { x: 42, y, font, size, color });
      y -= size + 6;
    }
  };
  const heading = (title: string) => {
    room(40);
    y -= 10;
    paragraph(title, 11, bold, navy);
  };
  const rightText = (text: string, x: number, size = 9, font = regular, color = ink) => {
    page.drawText(text, { x: x - font.widthOfTextAtSize(text, size), y, font, size, color });
  };
  const tableHeading = () => {
    room(28);
    page.drawRectangle({ x: 42, y: y - 7, width: 528, height: 23, color: soft });
    for (const [text, x] of [
      ["Service date", 47],
      ["Description", 126],
      ["Qty", 356],
      ["Rate", 409],
      ["Amount", 518],
    ] as const)
      page.drawText(text, { x, y, font: bold, size: 9, color: navy });
    y -= 29;
  };

  paragraph("QUICK PASS EMISSIONS", 21, bold, navy);
  paragraph(`Invoice ${invoice.number}`, 14, bold, blue);
  paragraph(
    `${invoice.status}${invoice.demo ? " · DEMONSTRATION — NOT A REAL BILL" : ""}`,
    10,
    bold,
  );
  paragraph(
    `Issued: ${invoiceDate(invoice.issueDate)}   |   Due: ${invoiceDate(invoice.dueDate)}`,
    10,
    regular,
    muted,
  );
  heading("BILL TO");
  paragraph(invoice.snapshot.name, 12, bold);
  paragraph(invoice.snapshot.billingAddress);
  if (invoice.snapshot.phone) paragraph(invoice.snapshot.phone);
  for (const contact of invoice.snapshot.contacts)
    paragraph(
      `${contact.name}${contact.purpose ? ` · ${contact.purpose}` : ""}${contact.email ? ` · ${contact.email}` : ""}${contact.phone ? ` · ${contact.phone}` : ""}`,
      9,
      regular,
      muted,
    );
  paragraph(`Service period: ${invoiceServicePeriod(invoice.lines.map((item) => item.date))}`, 10);
  paragraph(`Payment terms: net ${invoice.snapshot.termsDays} days`, 10);
  y -= 18;
  tableHeading();
  for (const item of invoice.lines) {
    const description = wrap(item.description, regular, 9, 213);
    const height = Math.max(1, description.length) * 14 + 12;
    if (room(height)) tableHeading();
    page.drawText(invoiceDate(item.date), { x: 47, y, font: regular, size: 8, color: ink });
    for (const [index, text] of description.entries())
      page.drawText(text, { x: 126, y: y - index * 14, font: regular, size: 9, color: ink });
    rightText(String(item.quantity), 378);
    rightText(invoiceMoney(item.unitCents), 472);
    rightText(invoiceMoney(item.amountCents), 565);
    y -= height;
    page.drawLine({
      start: { x: 42, y: y + 6 },
      end: { x: 570, y: y + 6 },
      thickness: 0.5,
      color: lineColor,
    });
  }
  room(140);
  y -= 12;
  for (const [label, value, emphasized] of [
    ["Subtotal", invoice.subtotalCents, false],
    [`Tax (${invoice.taxBps / 100}%)`, invoice.taxCents, false],
    ["Invoice total", invoice.totalCents, true],
    ["Received net payments", invoice.paidCents, false],
    ["Outstanding balance", invoice.remainingCents, true],
  ] as const) {
    const color = emphasized ? navy : ink;
    page.drawText(label, { x: 320, y, font: emphasized ? bold : regular, size: 10, color });
    rightText(invoiceMoney(value), 565, 10, emphasized ? bold : regular, color);
    y -= 22;
  }
  if (invoice.notes) {
    heading("INVOICE NOTES");
    paragraph(invoice.notes);
  }
  const pages = document.getPages();
  for (const [index, sheet] of pages.entries()) {
    sheet.drawRectangle({ x: 42, y: 775, width: 528, height: 5, color: navy });
    sheet.drawLine({
      start: { x: 42, y: 40 },
      end: { x: 570, y: 40 },
      thickness: 0.5,
      color: lineColor,
    });
    sheet.drawText(`Quick Pass Emissions | Page ${index + 1} of ${pages.length}`, {
      x: 42,
      y: 25,
      font: regular,
      size: 8,
      color: muted,
    });
  }
  return document.save();
}

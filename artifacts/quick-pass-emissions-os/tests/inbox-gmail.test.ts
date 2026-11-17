import { describe, expect, it } from "vitest";
import {
  extractEmailBody,
  GMAIL_INBOX_ADDRESS,
  INBOX_CATEGORIES,
  INBOX_IMPORTANCE,
} from "../src/modules/inbox/gmail";

const encode = (value: string) => Buffer.from(value).toString("base64url");

describe("Gmail inbox presentation helpers", () => {
  it("is restricted to the Quick Pass mailbox and has useful categories and priority levels", () => {
    expect(GMAIL_INBOX_ADDRESS).toBe("qpemissions@gmail.com");
    expect(INBOX_CATEGORIES).toContain("Dealerships & invoices");
    expect(INBOX_CATEGORIES).toContain("Employees & payroll");
    expect(INBOX_CATEGORIES).toContain("Service & repairs");
    expect(INBOX_IMPORTANCE).toEqual(["LOW", "NORMAL", "HIGH", "URGENT"]);
  });

  it("prefers plain text when the message also contains HTML", () => {
    const body = extractEmailBody({
      mimeType: "multipart/alternative",
      parts: [
        { mimeType: "text/plain", body: { data: encode("Hello\nQuick Pass") } },
        {
          mimeType: "text/html",
          body: { data: encode("<p>HTML copy</p>") },
        },
      ],
    });
    expect(body.text).toBe("Hello\nQuick Pass");
    expect(body.truncated).toBe(false);
  });

  it("converts HTML-only email to safe plain text without script content", () => {
    const body = extractEmailBody({
      mimeType: "text/html",
      body: {
        data: encode("<p>Payment received</p><script>bad()</script><p>Thanks</p>"),
      },
    });
    expect(body.text).toContain("Payment received");
    expect(body.text).toContain("Thanks");
    expect(body.text).not.toContain("bad()");
  });

  it("caps the message body shown in the app", () => {
    const body = extractEmailBody({
      mimeType: "text/plain",
      body: { data: encode("x".repeat(50_010)) },
    });
    expect(body.text).toHaveLength(50_000);
    expect(body.truncated).toBe(true);
  });
});

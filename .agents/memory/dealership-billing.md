---
name: Dealership billing
description: The user's regular invoice-email requirement for dealership partners.
---

The user needs to bill partnered auto dealerships and said: “Email invoices regularly. Stay organized and consistent.”

**Why:** The user explicitly requested regular dealership invoice emailing, not just storing delivery notes.

**How to apply:** Treat invoice preparation, the dealership billing contact, actual email delivery, and delivery tracking as related work. Do not equate a saved delivery record with an email having been sent or invent a recurring cadence.

The user authorized on-demand invoice sending through the connected `qpemissions@gmail.com` account without leaving the app.

**Why:** The user wants to send each dealership invoice manually from the app, with a final recipient and attachment confirmation rather than a Gmail-browser handoff or automatic schedule.

**How to apply:** Verify the connected mailbox, show the recipient and invoice PDF before send, and require an explicit in-app confirmation for every message. Mark an invoice sent only after Gmail confirms; if the result is uncertain, check Gmail Sent before retrying.

Dealership VIR uploads should tally inspections and prepare draft invoices. The user chose “OCR plus manual review” for scanned PDFs.

**Why:** The sample's embedded text was unreliable; the user explicitly selected scan recognition with review instead of rejecting scanned reports.

**How to apply:** Keep OCR local and require reviewed fields before billing. Use the dealership's authorized rate rather than treating a printed test fee as its contracted price. Uploading a report is not authorization to approve, send or collect payment.

VIR uploads must show upload and processed counts and automatically process larger submissions in sequential batches of no more than 40 VIRs.

**Why:** The user explicitly requested visible counts and automatic splitting above 40 reports.

**How to apply:** Preserve the full-upload tally across batch boundaries and distinguish processed pages from billable inspections; free or excluded reports must not disappear from processing counts.

Dealership invoices should be tailored to each recipient using their official website branding, while Quick Pass remains clearly identified as the invoice issuer.

**Why:** The user asked for dealership-specific invoice designs referenced from their five partner websites. Customer branding must not imply that the dealership issued the invoice.

**How to apply:** Use reviewed local branding assets, not live website requests during PDF creation. Public contact information is not permission to overwrite saved billing contacts, addresses, rates, payment instructions or terms.

Dealerships are billed monthly, with payment due within 30 days.

**Why:** The user clarified the business's billing cycle and due period.

**How to apply:** Keep monthly invoice grouping/cadence distinct from Net 30 payment terms. Current invoice preparation and sending remain manual unless the user explicitly authorizes automation.

Dealership invoice numbers use `QP-YYYY-NNNN` (for example, `QP-2026-0001`), with a yearly sequence.

**Why:** The user specified the invoice-number format.

**How to apply:** Use the issue-date year, increment the yearly sequence, preserve existing invoice identifiers, and reject manually entered numbers that do not match the format or issue year.

Quick Pass dealership invoices should reference `qpemissions@gmail.com` and `quickpassemissions.com`.

**Why:** The user specified the business sender address and website for invoice documents and delivery.

**How to apply:** Include both in invoice PDFs and the email signature. Verify the connected Gmail mailbox is `qpemissions@gmail.com` before sending and use it as the From address.

Every dealership invoice email must BCC `askforjay@gmail.com`, while keeping that address hidden from the dealership recipient and visible in the sender's confirmation.

**Why:** The user explicitly requested a blind copy on dealership invoices.

**How to apply:** Add the fixed BCC to each manually confirmed invoice email and show it in the in-app confirmation; do not expose it in the visible To field or customer-facing body.

The owner sends invoice emails from the app after reviewing the billing snapshot, without a separate approval or delivery-record panel.

**Why:** The user explicitly chose composing invoice emails without separate approval and asked to remove the review/delivery panel.

**How to apply:** Allow a manual confirmed send for unpaid, non-void invoices. Sending issues a draft and records it as sent only after Gmail confirms. Never send automatically.

The Quick Pass inbox reads `qpemissions@gmail.com` live and stores only team annotations: topic, importance, follow-up status and notes.

**Why:** The user wants to triage incoming business email in the app without creating another stored copy of message content.

**How to apply:** Restrict inbox access to finance managers, fetch messages on demand, and never persist bodies or attachments. For removal, use the reversible Gmail Trash action only after explicit confirmation; the current standard Gmail connector lacks `gmail.modify`, so actual Trash requires a custom OAuth client configured with that scope.

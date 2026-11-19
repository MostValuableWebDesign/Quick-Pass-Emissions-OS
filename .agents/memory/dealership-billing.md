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

Billable VIR invoices should include the VIN printed for each inspection, without rejecting provider-accepted VINs for format or check-digit reasons.

**Why:** The user needs the test vehicle identified on the customer invoice, and says a GCAF-accepted test remains countable even when its VIN is invalid.

**How to apply:** Require a VIN value for a billable report but preserve the reviewed value as printed. Show each report's test ID paired with its VIN in invoice details. Retain VIN values only on billable service records and invoice snapshots; never retain PDF bytes or full OCR text. A duplicate report may backfill a missing VIN only when it matches the saved inspection, without creating a second charge.

Dealership invoices should be tailored to each recipient using their official website branding, while Quick Pass remains clearly identified as the invoice issuer.

**Why:** The user asked for dealership-specific invoice designs referenced from their five partner websites. Customer branding must not imply that the dealership issued the invoice.

**How to apply:** Use reviewed local branding assets, not live website requests during PDF creation. Public contact information is not permission to overwrite saved billing contacts, addresses, rates, payment instructions or terms.

Dealerships are billed monthly, with payment due within 30 days.

**Why:** The user clarified the business's billing cycle and due period.

**How to apply:** Keep monthly invoice grouping/cadence distinct from Net 30 payment terms. Current invoice preparation and sending remain manual unless the user explicitly authorizes automation.

All dealerships are charged $15 per car, with 0% tax and Net 30 terms.

**Why:** The user stated “all dealerships are 15$” after a newly added partner was blocked by a missing rate; they previously confirmed the tax and due period.

**How to apply:** Include these owner-authorized terms when creating a dealership, not just for the existing partner list. Preserve historical services and invoice snapshots when correcting current billing settings.

Dealership invoice numbers use `QP-YYYY-NNNN` (for example, `QP-2026-0001`), with a yearly sequence.

**Why:** The user specified the invoice-number format.

**How to apply:** Use the issue-date year, increment the yearly sequence, preserve existing invoice identifiers, and reject manually entered numbers that do not match the format or issue year.

Quick Pass invoice PDFs reference the website; the email address is the Gmail From identity, not a repeated line in the email sign-off.

**Why:** The user specified the sender address and website, then asked to remove both from the email's “Best,” sign-off.

**How to apply:** Keep both business details on invoice PDFs, but do not append them to the email sign-off. Verify the connected Gmail mailbox is `qpemissions@gmail.com` and use it as the From address.

Invoice BCC to `askforjay@gmail.com` is optional for each email and must remain hidden from the dealership recipient.

**Why:** The user changed the earlier always-BCC rule so the sender can choose whether to include a blind copy.

**How to apply:** Provide a per-send control, include the BCC only when selected, and accurately show the choice in the sender's confirmation.

The owner sends invoice emails from the app after reviewing the billing snapshot, without a separate approval or delivery-record panel.

**Why:** The user explicitly chose composing invoice emails without separate approval and asked to remove the review/delivery panel.

**How to apply:** Allow a manual confirmed send for unpaid, non-void invoices. Sending issues a draft and records it as sent only after Gmail confirms. Never send automatically.

Confirmed Gmail sends may be performed by the invoice creator; legacy separate-review database constraints must not block that transition.

**Why:** The owner chose no separate approval. An older database constraint prevented an actually sent email from leaving Draft. Gmail also replaced the supplied Message-ID, making that identifier alone insufficient for recovery.

**How to apply:** Keep database constraints consistent with owner-confirmed sending. When the Message-ID lookup misses, verify the uniquely numbered invoice attachment in Gmail Sent before retrying; never resend solely because the app still says Draft.

Invoices of any status may be archived and restored; permanent deletion is limited to unsent drafts with no payments.

**Why:** The user approved archiving all invoices while allowing deletion only for drafts, preserving sent, paid and voided financial history.

**How to apply:** Keep archived invoices in reports/history but out of the active list. Before deleting a draft, verify Gmail Sent, release its service allocations for rebilling, retain an audit tombstone, and never reuse its invoice number.

Intentional resends must be distinguished from retries of the same email attempt.

**Why:** The user requested both resending existing invoices and recreating deleted drafts from saved VIRs. A matching invoice attachment alone proves an earlier email, not a particular resend.

**How to apply:** Reconcile a resend using its unique delivery-attempt identity, recipient and attachment. Preserve the original bill and reports; unresolved delivery must block a new send until checked.

The Quick Pass inbox reads `qpemissions@gmail.com` live and stores only team annotations: topic, importance, follow-up status and notes.

**Why:** The user wants to triage incoming business email in the app without creating another stored copy of message content.

**How to apply:** Restrict inbox access to finance managers, fetch messages on demand, and never persist bodies or attachments. For removal, use the reversible Gmail Trash action only after explicit confirmation; the current standard Gmail connector lacks `gmail.modify`, so actual Trash requires a custom OAuth client configured with that scope.

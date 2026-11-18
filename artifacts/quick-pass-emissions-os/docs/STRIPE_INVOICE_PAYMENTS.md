# Invoice-specific Stripe payments

## Using payments

- Sending an invoice from its confirmation dialog adds a secure, invoice-specific payment link
  to the Gmail message. The existing PDF attachment, recipient selection and optional BCC remain.
- The link is not payable while the Quick Pass invoice is a draft. After Gmail confirms and the
  invoice is issued, the customer can open the link and continue to Stripe.
- Opening an email or previewing the payment page does not create a Stripe invoice. Continuing
  creates a Stripe-hosted invoice for the **current unpaid balance**, not a fixed-price link.
  Quick Pass remains the source of the dealership's invoice number, original terms and records.
- No Stripe `/send` or automatic collection operation is used. Stripe does not send a second
  invoice email from this flow. A customer must enter/confirm payment on Stripe.
- For older sent invoices, use **Create payment link** in the invoice's Online payment section.
  This does not email the dealership.
- **Check Stripe payment status** is available once Stripe has prepared a payment page. It is
  also a recovery path if a payment webhook is delayed.

## Configuration

The Replit Stripe API connection is used server-side through the connectors SDK. No additional
Stripe API key is copied into the app. The invoice sender still needs the existing Gmail connection.

The payment page and webhook must be reachable at a stable, public HTTPS app address. The app uses
`OWNER_SUMMARY_APP_URL`, if configured, or its runtime-provided Replit domain. Use a published app
address for customer-facing invoices; preview addresses are not a durable payment service.

The first explicit payment-link preparation checks/registers the invoice-payment webhook on the
connected Stripe account. Development verification mocks this API; it does not register a live
webhook, email customers, create live payment requests or charge a card.

## Confirmation and safeguards

- Posted webhook content is **not trusted** as proof of payment. Known request IDs are checked
  locally; the event, invoice, invoice payment and succeeded PaymentIntent are independently
  retrieved using the connected account. The amount, currency, customer and Quick Pass request
  metadata must match. Out-of-band "marked paid" invoices are not booked as card receipts.
- The financial write locks and unique Stripe invoice/PaymentIntent references prevent duplicate
  receipts, including concurrent webhook delivery and manual status checks.
- Draft, void, archived and fully paid invoices cannot start a payable Stripe page. Amounts cannot
  be supplied or changed by the browser.
- An unpaid Stripe page is voided before a cash/check payment, manual reversal, void or archive
  changes the invoice. If Stripe cannot confirm closure, the local financial mutation is not
  committed. If Stripe has already received payment, check its status first.
- In-progress requests retain their idempotency identity for safe retry rather than silently
  issuing a second payment page. A temporarily failed preparation can be retried after 90 seconds.
  **Cancel online payment** safely closes a failed preparation after that wait and disables its old
  email link. Each provider-creation step is fenced by the financial mutation lock, so an old worker
  cannot create a payment page after cancellation. If an invoice-create response was lost, the app
  checks the saved request-specific customer's invoice list and exact metadata before cancellation.
  It deletes an unpaid draft or voids an unpaid open invoice; if payment status cannot be verified,
  it leaves the request blocked rather than risk a second collection.
- Provider-confirmed discrepancies are shown for review and audited without inventing a receipt.
- Existing manual receipts and their signed reversals remain intact. Stripe refunds/disputes are
  not automatically imported in this version; manage refunds in Stripe and reconcile them before
  treating the Quick Pass balance as adjusted. Manual "reverse receipt" is intentionally not offered
  for Stripe card payments because it would not refund the card.

## Verification

The focused payment, email, lifecycle, route and PDF-route suites passed 58 checks using mocked
Stripe/Gmail calls and a separate disposable PostgreSQL database. All migrations were applied to
that database before tests. TypeScript and changed-file ESLint checks passed; preview startup and
the public payment-unavailable page were verified.

A Chromium check used the shared positive payment-page renderer with a temporary, same-origin
303 fixture. The browser followed the form submission to a deliberately nonexistent
`invoice.stripe.com` invoice page, confirming the CSP allows the Stripe handoff. The temporary
fixture was removed afterward. It made no Stripe API call, real invoice or payment; the only Stripe
traffic was a read-only navigation to that nonexistent page.

The older `phase4-database.test.ts` suite still contains pre-existing `INV-*` invoice fixtures that
the current `QP-YYYY-NNNN` invoice-number rule rejects. Its failures are not counted as passing
coverage. No real customer payment or delivery was used for verification.

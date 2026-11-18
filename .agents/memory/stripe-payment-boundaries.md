---
name: Invoice payment boundaries
description: Why invoice-specific Stripe payments remain tied to explicit sending and current balances.
---

The user authorized invoice-specific Stripe amounts instead of the existing fixed-price payment
link. Quick Pass remains the invoice and balance authority; Stripe provides the hosted payment
page, not a separate dealership rate or billing schedule.

**Why:** The user needs each dealership to pay what it actually owes, while preserving manual
invoice emailing and existing payments.

**How to apply:** Keep draft email preparation distinct from making a payment available. Draft
links must stay unpayable until the invoice has been issued following confirmed delivery. Preserve
cash/check receipts and close stale payable pages before changing the balance.

This project's connected Stripe service is an API-proxy connection, not the credential-based
Stripe starter setup. Do not replace it with a parallel key-based integration.

**Why:** The installed connection's own contract supplies authenticated server-side API access;
generic Stripe starter instructions describe a different setup.

**How to apply:** Follow the installed connection's instructions and verify payments against its
authenticated provider records. Never treat a browser return URL or posted event body as payment
proof. Development checks must not send customer invoices or initiate live charges.

Chromium can enforce a payment form's `form-action` policy against a cross-origin 303 redirect,
not just the same-origin form target.

**Why:** An HTTP-level redirect check passed even though the original restrictive policy prevented
the browser from continuing to Stripe.

**How to apply:** Keep the intended payment destination explicitly allowed and verify the browser
handoff, using mocked external navigation when a live payment is not authorized.

Failed provider preparation must have a safe cancellation path, not merely another retry.

**Why:** Retaining an in-progress state without recovery can indefinitely block cash/check receipts
and invoice archival even when no payable provider page remains.

**How to apply:** Fence each remote creation step against cancellation, retain request identity
between steps, verify or recover the provider request before releasing it, and remain fail-closed
when payment status is uncertain.

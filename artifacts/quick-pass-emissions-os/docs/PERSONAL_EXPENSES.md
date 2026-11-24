# Personal business expenses

Open **Overview → Notes & Tasks → Expenses**, or use **Expense** on a saved note
or task. Everything stays private to the signed-in management account.
This is recordkeeping only: no purchase approvals, bank transfers, card charges,
automatic subscriptions, dealership billing changes, or tax-deductibility decisions.

## Quick capture and reuse

A title is sufficient. The date defaults to today's Eastern business date.
Amount, vendor, category, purpose, and payment method can be completed later.
Missing details are gentle prompts; they never block a draft.

Existing expenses can be linked to multiple notes/tasks without copying purchases.
A stable client ID makes repeated submissions safe; likely identical purchases
offer the existing record or an explicit choice to record a separate purchase.

## Money and balances (USD)

All amounts are exact integer cents.

- **Planned:** future/intended spending, not a payment or an amount owed.
- **Unpaid:** an incurred purchase with no recorded payments.
- **Part-paid:** vendor payments are below the saved purchase total.
- **Paid:** vendor payments cover the purchase total, including a known zero-cost item.
- **Refund:** reduces net spending, never creates a new vendor debt.
- **Reimbursement:** pays back personally funded business purchases. It is shown
  separately and never counted again as a new purchase expense.
- **Reimbursement return:** money returned after an earlier reimbursement, for
  example when a personally paid purchase was later refunded.

The recorded purchase amount must be known before payments can be recorded.
Overpayments, over-refunds, and invalid backdated balances are rejected. Future
money movements are not recorded as actual spending; use Planned instead.
Both business and personal funding are supported, including which funding source
received a refund. A refund after reimbursement can create a visible return-due
amount until the return is recorded.

Corrections preserve the original voided entry, dated replacement, and reason.
Voiding also requires a reason and never permanently deletes a money movement.
Detail changes retain before/after history. Archiving hides a record from the active
book but does not erase its actual spending from reports; archived planned items
stop contributing to the planned-purchases projection.

## Reports and biweekly summaries

Monthly, annual, and custom reports use inclusive YYYY-MM-DD boundaries.
Payments, refunds, and reimbursements use their **transaction dates**. Planned
purchases still marked planned use their **expense dates**. Category totals use the current category.
The remaining-balance total refers to included purchases at the report end;
unknown purchase totals remain explicitly unknown instead of becoming zero.

CSV contains one row per included expense, with separate period payment, refund,
net-spending, reimbursement and planned columns, plus transaction references.
Spreadsheet formula prefixes and quoted/comma-containing fields are escaped.
This is bookkeeping data for the owner/accountant, not a deduction determination.

New biweekly snapshots include this same spending calculation. Older saved
summaries remain unchanged until deliberately regenerated; the UI explains how
to add spending to them. Existing independent scheduling behavior is unchanged.

## Private attachments

PDF, PNG, JPEG and WEBP, up to 10 MB each. The authenticated server prepares a
short-lived PUT URL; the browser sends bytes directly to App Storage. Only object
paths and metadata are saved in PostgreSQL. Completion checks actual size, type,
and signature, freezes a separate final object, and associates it with the owner's
expense. An unexpired upload URL cannot overwrite the completed receipt.
Downloads recheck the active account and expense ownership, force attachment
download, and use private/no-store and no-sniff headers. Pending/failed uploads
are not presented as completed receipts.

## Verification

- `pnpm --filter @workspace/quick-pass-emissions-os typecheck`
- `pnpm --filter @workspace/quick-pass-emissions-os exec vitest run tests/expense-rules.test.ts`
- Prepare isolated accounts with `scripts/personal-workspace-verify.ts`, then run
  `scripts/expense-workspace-verify.ts` for database and real private-storage checks.
- After any browser checks, run `scripts/expense-workspace-verify.ts cleanup`
  **before** `scripts/personal-workspace-verify.ts cleanup` to remove only the
  synthetic users' stored receipt objects and account records.

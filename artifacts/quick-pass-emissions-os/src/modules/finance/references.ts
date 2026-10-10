import { requireRule, type Tx } from "../phase4";
export async function uniqueReceiptReference(tx: Tx, reference: string) {
  requireRule(
    !(await tx.dealerPayment.count({ where: { reference } })) &&
      !(await tx.financeEntry.count({ where: { reference } })) &&
      !(await tx.rentalPayment.count({ where: { reference } })),
    "This payment/finance reference already exists.",
  );
}

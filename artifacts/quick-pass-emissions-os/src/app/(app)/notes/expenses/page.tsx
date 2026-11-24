import { Suspense } from "react";
import { currentUser } from "@/lib/access";
import { expenseWorkspace } from "@/modules/personal/expense-service";
import { ExpenseWorkspace } from "@/components/personal/expenses-workspace";

export default async function ExpensesPage() {
  const actor = await currentUser();
  const initialData = await expenseWorkspace(actor.id);
  return (
    <Suspense fallback={null}>
      <ExpenseWorkspace initialData={initialData} />
    </Suspense>
  );
}

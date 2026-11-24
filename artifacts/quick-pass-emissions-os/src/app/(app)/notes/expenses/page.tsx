import { currentUser } from "@/lib/access";
import { expenseWorkspace } from "@/modules/personal/expense-service";
import { ExpenseWorkspace } from "@/components/personal/expenses-workspace";

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ note?: string; task?: string }>;
}) {
  const actor = await currentUser();
  const initialData = await expenseWorkspace(actor.id);
  const params = await searchParams;
  const sourceRef = params.note
    ? { kind: "note" as const, id: params.note }
    : params.task
      ? { kind: "task" as const, id: params.task }
      : null;
  return <ExpenseWorkspace initialData={initialData} sourceRef={sourceRef} />;
}

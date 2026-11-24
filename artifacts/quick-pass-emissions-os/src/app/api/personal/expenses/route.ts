import { currentUser } from "@/lib/access";
import { expenseWorkspace, mutateExpenseWorkspace } from "@/modules/personal/expense-service";
import {
  expenseError,
  expenseResponse,
  trustedExpenseRequest,
} from "@/modules/personal/expense-http";
export async function GET() {
  const actor = await currentUser();
  try {
    return expenseResponse({ data: await expenseWorkspace(actor.id) });
  } catch (error) {
    return expenseError(error);
  }
}
export async function POST(request: Request) {
  const actor = await currentUser();
  try {
    trustedExpenseRequest(request);
    return expenseResponse(await mutateExpenseWorkspace(actor.id, await request.json()));
  } catch (error) {
    return expenseError(error);
  }
}

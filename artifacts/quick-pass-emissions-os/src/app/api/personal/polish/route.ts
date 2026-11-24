import { currentUser } from "@/lib/access";
import { polishPersonalNote } from "@/modules/personal/polish";
import {
  expenseResponse,
  expenseError,
  trustedExpenseRequest,
} from "@/modules/personal/expense-http";
export async function POST(request: Request) {
  const actor = await currentUser();
  try {
    trustedExpenseRequest(request);
    return expenseResponse({
      suggestion: await polishPersonalNote(actor.id, await request.json()),
    });
  } catch (error) {
    return expenseError(error);
  }
}

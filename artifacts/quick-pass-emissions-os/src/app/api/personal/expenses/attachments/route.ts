import { currentUser } from "@/lib/access";
import { completeReceipt, prepareReceipt } from "@/modules/personal/expense-storage";
import {
  expenseError,
  expenseResponse,
  trustedExpenseRequest,
} from "@/modules/personal/expense-http";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const actor = await currentUser();
  try {
    trustedExpenseRequest(request);
    const command = await request.json();
    if (command.op === "prepare") return expenseResponse(await prepareReceipt(actor.id, command));
    if (command.op === "complete" && typeof command.id === "string" && command.id.length <= 160)
      return expenseResponse(await completeReceipt(actor.id, command.id));
    throw new Error("Choose an upload action.");
  } catch (error) {
    return expenseError(error);
  }
}

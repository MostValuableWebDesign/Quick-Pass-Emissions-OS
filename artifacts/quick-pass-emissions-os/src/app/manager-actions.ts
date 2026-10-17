"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { currentUser } from "@/lib/access";
import { fields } from "@/lib/validation";
import { BusinessError } from "@/modules/phase2";
import { decimalHundredths } from "@/modules/marketing/rules";
import * as manager from "@/modules/manager/service";
import * as registers from "@/modules/manager/registers";
import type { ActionState } from "./actions";
export async function managerAction(_: ActionState, form: FormData): Promise<ActionState> {
  const actor = await currentUser();
  try {
    const values = fields(form),
      command = String(form.get("command"));
    switch (command) {
      case "PROFILE":
        await manager.createOwnResponsibilityProfile(actor.id);
        break;
      case "EDIT_DUTY":
        await manager.editDuty(actor.id, {
          ...values,
          reviewRequired: form.get("reviewRequired") === "on",
          weekdays: form.getAll("weekdays"),
          dependencies: [],
          checklist: String(form.get("checklist") ?? "")
            .split("\n")
            .map((v) => v.trim())
            .filter(Boolean)
            .map((label) => ({ label, done: false })),
        });
        break;
      case "CREATE_TASK":
        await manager.createManagerTask(actor.id, {
          ...values,
          reviewRequired: form.get("reviewRequired") === "on",
          weekdays: form.getAll("weekdays"),
          dependencies: form.getAll("dependencies"),
          checklist: String(form.get("checklist") ?? "")
            .split("\n")
            .map((v) => v.trim())
            .filter(Boolean)
            .map((label) => ({ label, done: false })),
        });
        break;
      case "TASK_DETAILS":
        await manager.updateDetails(actor.id, {
          ...values,
          dependencies: form.getAll("dependencies"),
          checklist: [
            ...form.getAll("checklistLabel").map((label, i) => ({
              label: String(label),
              done: form.getAll("done").includes(String(i)),
            })),
            ...String(form.get("newChecklist") ?? "")
              .split("\n")
              .map((v) => v.trim())
              .filter(Boolean)
              .map((label) => ({ label, done: false })),
          ],
        });
        break;
      case "STARTER":
        await manager.installStarter(actor.id, values);
        break;
      case "REFRESH":
        await manager.refreshWorkspace(actor.id);
        break;
      case "AVAILABILITY":
        await manager.saveAvailability(actor.id, {
          version: values.version,
          reservePercent: values.reservePercent,
          days: [1, 2, 3, 4, 5, 6, 7]
            .filter((d) => form.get(`day${d}`) === "on")
            .map((weekday) => ({
              weekday,
              start: values[`start${weekday}`],
              end: values[`end${weekday}`],
              breaks: String(values[`breaks${weekday}`] ?? "").trim()
                ? String(values[`breaks${weekday}`])
                    .split(",")
                    .map((v) => {
                      const [start, end] = v.trim().split("-");
                      return { start, end };
                    })
                : [],
            })),
        });
        break;
      case "COMMITMENT":
        await manager.saveCommitment(actor.id, values);
        break;
      case "CANCEL_COMMITMENT":
        await manager.cancelCommitment(actor.id, values.id);
        break;
      case "PREVIEW":
        await manager.previewSchedule(actor.id, values.start);
        break;
      case "APPROVE_SCHEDULE":
        await manager.approveSchedule(actor.id, values.id);
        break;
      case "EDIT_OPERATIONS_SCHEDULE_BLOCK":
        await manager.updateOperationsScheduleBlock(actor.id, values);
        break;
      case "APPROVE_OPERATIONS_SCHEDULE":
        await manager.approveOperationsSchedule(actor.id, values);
        break;
      case "CONTACTS":
        await manager.importVendorContacts(actor.id);
        break;
      case "SUPPLY":
        await registers.saveSupply(actor.id, {
          ...values,
          id: values.id || undefined,
          balance: values.balance === "" ? null : values.balance,
          reorderLevel: values.reorderLevel === "" ? null : values.reorderLevel,
        });
        break;
      case "PREPARE_PURCHASE":
        await registers.preparePurchase(actor.id, values);
        break;
      case "ADVANCE_PURCHASE":
        await registers.advancePurchase(actor.id, values);
        break;
      case "BANK_LIMIT":
        await registers.saveBankLimit(actor.id, {
          ...values,
          remoteLimitCents: values.amount === "" ? null : decimalHundredths(values.amount),
        });
        break;
      case "FINANCIAL_EVIDENCE":
        await registers.recordFinancialEvidence(actor.id, {
          ...values,
          amountCents: decimalHundredths(values.amount),
        });
        break;
      case "RECONCILE":
        await registers.reconcileFinancialEvidence(actor.id, values);
        break;
      case "SUBMIT_DEPOSIT":
        await registers.recordDepositSubmission(actor.id, values);
        break;
      default:
        throw new BusinessError("Unknown workspace action.");
    }
    revalidatePath("/", "layout");
    return { ok: true, message: "Saved successfully." };
  } catch (error) {
    if (error instanceof z.ZodError)
      return { ok: false, message: error.issues[0]?.message ?? "Check your entries." };
    if (error instanceof BusinessError) return { ok: false, message: error.message };
    return { ok: false, message: "Unable to save. Refresh and check the entries and connection." };
  }
}

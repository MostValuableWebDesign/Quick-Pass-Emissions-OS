"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionState } from "@/app/actions";
import { currentUser } from "@/lib/access";
import { db } from "@/lib/db";
import {
  GmailInboxError,
  INBOX_CATEGORIES,
  INBOX_IMPORTANCE,
  inboxMessageDetail,
  moveInboxMessageToTrash,
  requireQuickPassMailbox,
} from "@/modules/inbox/gmail";

const annotationInput = z.object({
  messageId: z.string().regex(/^[A-Za-z0-9_-]{1,256}$/),
  category: z.enum(INBOX_CATEGORIES),
  importance: z.enum(INBOX_IMPORTANCE),
  followUp: z.boolean(),
  notes: z.string().trim().max(2000),
});

export async function saveInboxAnnotation(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const user = await currentUser();
  const parsed = annotationInput.safeParse({
    messageId: form.get("messageId"),
    category: form.get("category"),
    importance: form.get("importance"),
    followUp: form.get("followUp") === "on",
    notes: form.get("notes"),
  });
  if (!parsed.success)
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the email details." };

  try {
    const [accountEmail, message] = await Promise.all([
      requireQuickPassMailbox(),
      inboxMessageDetail(parsed.data.messageId),
    ]);
    if (!message) return { ok: false, message: "This email is no longer in the inbox." };
    await db.gmailInboxAnnotation.upsert({
      where: {
        accountEmail_messageId: {
          accountEmail,
          messageId: parsed.data.messageId,
        },
      },
      create: {
        accountEmail,
        messageId: parsed.data.messageId,
        threadId: message.threadId,
        category: parsed.data.category,
        importance: parsed.data.importance,
        followUp: parsed.data.followUp,
        notes: parsed.data.notes,
        updatedById: user.id,
      },
      update: {
        threadId: message.threadId,
        category: parsed.data.category,
        importance: parsed.data.importance,
        followUp: parsed.data.followUp,
        notes: parsed.data.notes,
        updatedById: user.id,
      },
    });
    revalidatePath("/inbox");
    revalidatePath(`/inbox/${parsed.data.messageId}`);
    return { ok: true, message: "Email details saved." };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof GmailInboxError
          ? error.message
          : "Email details could not be saved. No email content was changed.",
    };
  }
}

export async function moveEmailToTrash(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  await currentUser();
  const parsed = z
    .object({ messageId: z.string().regex(/^[A-Za-z0-9_-]{1,256}$/) })
    .safeParse({ messageId: form.get("messageId") });
  if (!parsed.success) return { ok: false, message: "Select a valid inbox email." };

  try {
    const result = await moveInboxMessageToTrash(parsed.data.messageId);
    revalidatePath("/inbox");
    return {
      ok: true,
      message: `“${result.subject}” was moved to Gmail Trash. You can restore it from Trash.`,
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof GmailInboxError
          ? error.message
          : "Gmail could not move this message. It remains unchanged.",
    };
  }
}

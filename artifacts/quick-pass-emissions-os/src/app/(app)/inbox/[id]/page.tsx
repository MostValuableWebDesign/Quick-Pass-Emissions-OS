import { notFound } from "next/navigation";
import { RecordLink } from "@/components/record-link";
import { InboxAnnotationForm, GmailTrashControl } from "@/components/inbox-controls";
import { PageHeader } from "@/components/shared";
import { currentUser } from "@/lib/access";
import { TIMEZONE } from "@/lib/time";
import { GmailInboxError, inboxMessageDetail } from "@/modules/inbox/gmail";

export const dynamic = "force-dynamic";

function formatEmailDate(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    dateStyle: "full",
    timeStyle: "short",
  }).format(date);
}

export default async function InboxEmail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await currentUser();
  const { id } = await params;
  let message: Awaited<ReturnType<typeof inboxMessageDetail>> = null;
  let errorMessage = "";
  try {
    message = await inboxMessageDetail(id);
  } catch (error) {
    errorMessage =
      error instanceof GmailInboxError
        ? error.message
        : "This email could not be loaded. No email has been changed.";
  }
  if (!message && !errorMessage) notFound();
  if (!message)
    return (
      <>
        <PageHeader title="Inbox email" />
        <section className="card card-body">
          <p className="notice warning" role="alert">
            {errorMessage}
          </p>
          <RecordLink className="button button-outline" href="/inbox">
            Back to inbox
          </RecordLink>
        </section>
      </>
    );

  return (
    <>
      <PageHeader title={message.subject} description={message.sender}>
        <RecordLink className="button button-outline" href="/inbox">
          Back to inbox
        </RecordLink>
      </PageHeader>
      <div className="inbox-detail-grid">
        <section className="card inbox-email-card">
          <div className="card-heading inbox-email-heading">
            <div>
              <h2>{message.subject}</h2>
              <p>From {message.sender}</p>
              <p>{formatEmailDate(message.date)}</p>
            </div>
            {message.unread && <span className="badge green">Unread</span>}
          </div>
          <div className="inbox-email-body">
            {message.body ? (
              <pre>{message.body}</pre>
            ) : (
              <p className="muted">This email does not contain readable text.</p>
            )}
            {message.bodyTruncated && (
              <p className="muted">The message text was shortened to fit the in-app view.</p>
            )}
          </div>
          {!!message.attachments.length && (
            <div className="inbox-attachments">
              <h3>Attachments</h3>
              <ul>
                {message.attachments.map((name, index) => (
                  <li key={`${name}-${index}`}>{name}</li>
                ))}
              </ul>
            </div>
          )}
        </section>
        <aside className="inbox-tools">
          <section className="card card-body">
            <h2>Importance & topic</h2>
            <p className="muted">
              Your team’s labels and notes stay in Quick Pass. The email itself remains in Gmail.
            </p>
            <InboxAnnotationForm messageId={message.messageId} annotation={message.annotation} />
          </section>
          <section className="card card-body inbox-trash-card">
            <h2>Remove email</h2>
            <p className="muted">
              Move it to Gmail Trash. This is reversible; Quick Pass never permanently deletes email.
            </p>
            <p className="notice warning inbox-permission-note">
              Gmail Trash requires <code>gmail.modify</code>. The current connection may not include
              it; if permission is denied, the message will remain unchanged. Replit requires a
              custom Google OAuth client with this scope in the organization’s integration settings.
            </p>
            <GmailTrashControl messageId={message.messageId} subject={message.subject} />
          </section>
        </aside>
      </div>
    </>
  );
}

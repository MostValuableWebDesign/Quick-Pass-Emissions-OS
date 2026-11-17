import Link from "next/link";
import { RecordLink } from "@/components/record-link";
import { PageHeader } from "@/components/shared";
import { currentUser } from "@/lib/access";
import { TIMEZONE } from "@/lib/time";
import {
  GmailInboxError,
  INBOX_CATEGORIES,
  INBOX_IMPORTANCE,
  GMAIL_INBOX_ADDRESS,
  inboxPageData,
} from "@/modules/inbox/gmail";

export const dynamic = "force-dynamic";

function formatEmailDate(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function importanceClass(importance: string) {
  if (importance === "URGENT") return "badge danger";
  if (importance === "HIGH") return "badge amber";
  return "badge neutral";
}

export default async function Inbox({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    pageToken?: string;
    category?: string;
    importance?: string;
    followUp?: string;
    unread?: string;
  }>;
}) {
  await currentUser();
  const params = await searchParams;
  const query = (params.q ?? "").trim().slice(0, 160);
  const category = INBOX_CATEGORIES.includes(
    params.category as (typeof INBOX_CATEGORIES)[number],
  )
    ? params.category!
    : "";
  const importance = INBOX_IMPORTANCE.includes(
    params.importance as (typeof INBOX_IMPORTANCE)[number],
  )
    ? params.importance!
    : "";
  const followUpOnly = params.followUp === "1";
  const unreadOnly = params.unread === "1";
  let data: Awaited<ReturnType<typeof inboxPageData>> | null = null;
  let errorMessage = "";
  try {
    data = await inboxPageData({ query, pageToken: params.pageToken });
  } catch (error) {
    errorMessage =
      error instanceof GmailInboxError
        ? error.message
        : "The inbox could not be loaded. No email has been changed.";
  }

  const messages =
    data?.messages.filter(
      (message) =>
        (!category || message.annotation.category === category) &&
        (!importance || message.annotation.importance === importance) &&
        (!followUpOnly || message.annotation.followUp) &&
        (!unreadOnly || message.unread),
    ) ?? [];
  const unreadCount = data?.messages.filter((message) => message.unread).length ?? 0;
  const nextParams = new URLSearchParams();
  const refreshParams = new URLSearchParams();
  if (query) {
    nextParams.set("q", query);
    refreshParams.set("q", query);
  }
  if (category) {
    nextParams.set("category", category);
    refreshParams.set("category", category);
  }
  if (importance) {
    nextParams.set("importance", importance);
    refreshParams.set("importance", importance);
  }
  if (followUpOnly) {
    nextParams.set("followUp", "1");
    refreshParams.set("followUp", "1");
  }
  if (unreadOnly) {
    nextParams.set("unread", "1");
    refreshParams.set("unread", "1");
  }
  if (data?.nextPageToken) nextParams.set("pageToken", data.nextPageToken);

  return (
    <>
      <PageHeader title="Inbox" description={`Incoming email for ${GMAIL_INBOX_ADDRESS}.`}>
        <Link
          className="button button-outline"
          href={refreshParams.size ? `/inbox?${refreshParams.toString()}` : "/inbox"}
        >
          Refresh inbox
        </Link>
      </PageHeader>
      <p className="inbox-privacy-note">
        Messages load directly from Gmail. Quick Pass stores your topic, importance, follow-up flag
        and notes; message content stays in Gmail.
      </p>
      <section className="card card-body inbox-filters">
        <form method="get" action="/inbox" className="form-grid">
          <div className="field wide">
            <label>
              <span>Search inbox</span>
              <input
                name="q"
                defaultValue={query}
                maxLength={160}
                placeholder="Sender, subject, or Gmail search"
              />
            </label>
          </div>
          <div className="field">
            <label>
              <span>Topic</span>
              <select name="category" defaultValue={category}>
                <option value="">All topics</option>
                {INBOX_CATEGORIES.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="field">
            <label>
              <span>Importance</span>
              <select name="importance" defaultValue={importance}>
                <option value="">All importance levels</option>
                {INBOX_IMPORTANCE.map((value) => (
                  <option key={value} value={value}>
                    {value[0] + value.slice(1).toLowerCase()}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="inbox-follow-up-toggle">
            <input
              type="checkbox"
              name="followUp"
              value="1"
              defaultChecked={followUpOnly}
            />
            <span>Follow-up only</span>
          </label>
          <label className="inbox-follow-up-toggle">
            <input type="checkbox" name="unread" value="1" defaultChecked={unreadOnly} />
            <span>Unread only</span>
          </label>
          <div className="form-footer">
            <button className="button button-primary" type="submit">
              Search
            </button>
          </div>
        </form>
      </section>
      {errorMessage ? (
        <section className="card card-body space-top">
          <p className="notice warning" role="alert">
            {errorMessage}
          </p>
        </section>
      ) : (
        <section className="card space-top inbox-list">
          <div className="card-heading inbox-list-heading">
            <div>
              <h2>Recent email</h2>
              <p>
                {messages.length} shown · {data?.loadedCount ?? 0} loaded
                {data && data.totalEstimate > data.loadedCount
                  ? ` · about ${data.totalEstimate} in the inbox`
                  : ""}
              </p>
            </div>
            <span className="inbox-unread-count">{unreadCount} unread on this page</span>
          </div>
          {(category || importance || followUpOnly || unreadOnly) && (
            <p className="inbox-filter-note">
              Topic, importance and follow-up filters apply to the {data?.loadedCount ?? 0} emails
              loaded on this page.
            </p>
          )}
          {!messages.length ? (
            <p className="card-body muted">
              {data?.loadedCount
                ? "No emails on this page match those filters."
                : "No inbox emails were found."}
            </p>
          ) : (
            <ul className="inbox-message-list">
              {messages.map((message) => (
                <li key={message.messageId} className={message.unread ? "is-unread" : ""}>
                  <RecordLink
                    className="inbox-message-link"
                    href={`/inbox/${encodeURIComponent(message.messageId)}`}
                  >
                    <div className="inbox-message-top">
                      <strong>{message.subject}</strong>
                      <time dateTime={message.date}>{formatEmailDate(message.date)}</time>
                    </div>
                    <p className="inbox-sender">{message.sender}</p>
                    <p className="inbox-snippet">{message.snippet || "No preview text."}</p>
                    <div className="inbox-message-tags">
                      {message.unread && <span className="badge green">Unread</span>}
                      <span className="badge neutral">{message.annotation.category}</span>
                      <span className={importanceClass(message.annotation.importance)}>
                        {message.annotation.importance.toLowerCase()}
                      </span>
                      {message.annotation.followUp && <span className="badge amber">Follow up</span>}
                    </div>
                  </RecordLink>
                </li>
              ))}
            </ul>
          )}
          {data?.nextPageToken && (
            <div className="inbox-pagination">
              <Link className="button button-outline" href={`/inbox?${nextParams.toString()}`}>
                Load older email
              </Link>
            </div>
          )}
        </section>
      )}
    </>
  );
}

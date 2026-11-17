import { ReplitConnectors } from "@replit/connectors-sdk";
import { parseFragment, type DefaultTreeAdapterMap } from "parse5";
import { db } from "@/lib/db";
import type { InboxImportance } from "./constants";

export const GMAIL_INBOX_ADDRESS = "qpemissions@gmail.com";
export const GMAIL_INBOX_PAGE_SIZE = 25;
export { INBOX_CATEGORIES, INBOX_IMPORTANCE, type InboxImportance } from "./constants";

export class GmailInboxError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "GmailInboxError";
  }
}

type GmailHeader = { name?: string; value?: string };
type GmailPart = {
  mimeType?: string;
  filename?: string;
  headers?: GmailHeader[];
  body?: { data?: string; attachmentId?: string; size?: number };
  parts?: GmailPart[];
};
type GmailMessage = {
  id?: string;
  threadId?: string;
  labelIds?: string[];
  snippet?: string;
  internalDate?: string;
  payload?: GmailPart;
};
type GmailMessageList = {
  messages?: { id?: string }[];
  nextPageToken?: string;
  resultSizeEstimate?: number;
};
type GmailInboxAnnotation = {
  id: string;
  accountEmail: string;
  messageId: string;
  threadId: string;
  category: string;
  importance: InboxImportance;
  followUp: boolean;
  notes: string;
  updatedAt: Date;
};

const connector = () => new ReplitConnectors();
type GmailProxyOptions = Parameters<ReplitConnectors["proxy"]>[2];

async function gmailApi(path: string, init?: GmailProxyOptions) {
  try {
    const response = await connector().proxy("google-mail", path, init);
    if (!response.ok) {
      if (response.status === 401 || response.status === 403)
        throw new GmailInboxError("Gmail access was denied. Reconnect or update the Gmail connection.", response.status);
      if (response.status === 404)
        throw new GmailInboxError("This email is no longer available in the inbox.", response.status);
      if (response.status === 429)
        throw new GmailInboxError("Gmail is temporarily limiting requests. Wait a moment and refresh.", response.status);
      throw new GmailInboxError("Gmail could not complete the request. Try again.");
    }
    return response;
  } catch (error) {
    if (error instanceof GmailInboxError) throw error;
    throw new GmailInboxError("The Gmail connection is unavailable. Check the connection and try again.");
  }
}

export async function requireQuickPassMailbox() {
  const response = await gmailApi("/gmail/v1/users/me/profile");
  const profile = (await response.json()) as { emailAddress?: string };
  if (profile.emailAddress?.toLowerCase() !== GMAIL_INBOX_ADDRESS)
    throw new GmailInboxError(`Connect Gmail as ${GMAIL_INBOX_ADDRESS} to open this inbox.`);
  return profile.emailAddress;
}

function headerValue(message: GmailMessage, name: string) {
  return (
    message.payload?.headers
      ?.find((header) => header.name?.toLowerCase() === name.toLowerCase())
      ?.value?.replace(/\r?\n[ \t]+/g, " ")
      .trim() ?? ""
  );
}

function parts(root?: GmailPart): GmailPart[] {
  if (!root) return [];
  return [root, ...(root.parts ?? []).flatMap(parts)];
}

function decodeBase64Url(value: string) {
  return Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

type Node = DefaultTreeAdapterMap["node"];
const childNodes = (node: Node): Node[] => ("childNodes" in node ? node.childNodes : []);
function htmlText(node: Node): string {
  if ("value" in node) return node.value;
  if ("tagName" in node && ["script", "style", "template"].includes(node.tagName)) return "";
  if ("tagName" in node && node.tagName === "br") return "\n";
  const content = childNodes(node).map(htmlText).join("");
  if ("tagName" in node && ["address", "blockquote", "div", "li", "p", "pre", "tr"].includes(node.tagName))
    return `\n${content}\n`;
  return content;
}

export function extractEmailBody(payload?: GmailPart) {
  const messageParts = parts(payload);
  const plain = messageParts.find((part) => part.mimeType === "text/plain" && part.body?.data);
  const html = messageParts.find((part) => part.mimeType === "text/html" && part.body?.data);
  const source = plain?.body?.data
    ? decodeBase64Url(plain.body.data)
    : html?.body?.data
      ? decodeBase64Url(html.body.data)
      : "";
  const sourceLimit = plain?.body?.data ? 100_000 : 250_000;
  const sourceTruncated = source.length > sourceLimit;
  const limitedSource = source.slice(0, sourceLimit);
  const raw =
    plain?.body?.data || !html?.body?.data
      ? limitedSource
      : htmlText(parseFragment(limitedSource));
  const cleaned = raw
    .replace(/\r\n?/g, "\n")
    .replace(/\u0000/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return {
    text: cleaned.slice(0, 50_000),
    truncated: sourceTruncated || cleaned.length > 50_000,
  };
}

function attachments(message: GmailMessage) {
  return parts(message.payload)
    .filter((part) => part.filename && part.filename.trim())
    .map((part) => part.filename!.slice(0, 240));
}

function dateValue(message: GmailMessage) {
  const milliseconds = Number(message.internalDate);
  return Number.isFinite(milliseconds) && milliseconds > 0
    ? new Date(milliseconds).toISOString()
    : headerValue(message, "Date");
}

async function getMetadata(messageId: string): Promise<GmailMessage | null> {
  const query = new URLSearchParams({ format: "metadata" });
  for (const header of ["From", "Subject", "Date"]) query.append("metadataHeaders", header);
  try {
    const response = await gmailApi(
      `/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}?${query.toString()}`,
    );
    return (await response.json()) as GmailMessage;
  } catch (error) {
    if (error instanceof GmailInboxError && error.status === 404) return null;
    throw error;
  }
}

async function mapLimit<T, R>(items: T[], limit: number, work: (item: T) => Promise<R>) {
  const results = new Array<R>(items.length);
  let index = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const current = index++;
      if (current >= items.length) return;
      results[current] = await work(items[current]);
    }
  });
  await Promise.all(workers);
  return results;
}

export type InboxAnnotationView = Pick<
  GmailInboxAnnotation,
  "category" | "importance" | "followUp" | "notes" | "updatedAt"
>;

export type InboxListItem = {
  messageId: string;
  threadId: string;
  sender: string;
  subject: string;
  snippet: string;
  date: string;
  unread: boolean;
  annotation: InboxAnnotationView;
};

export type InboxPageData = {
  accountEmail: string;
  messages: InboxListItem[];
  nextPageToken: string;
  totalEstimate: number;
  loadedCount: number;
};

const defaultAnnotation: InboxAnnotationView = {
  category: "Uncategorized",
  importance: "NORMAL",
  followUp: false,
  notes: "",
  updatedAt: new Date(0),
};

export async function inboxPageData(input: {
  query?: string;
  pageToken?: string;
}): Promise<InboxPageData> {
  const accountEmail = await requireQuickPassMailbox();
  const query = new URLSearchParams({
    labelIds: "INBOX",
    maxResults: String(GMAIL_INBOX_PAGE_SIZE),
  });
  const search = input.query?.trim().slice(0, 160);
  if (search) query.set("q", search);
  if (
    input.pageToken &&
    input.pageToken.length <= 4096 &&
    /^[A-Za-z0-9_+/=-]+$/.test(input.pageToken)
  )
    query.set("pageToken", input.pageToken);
  const response = await gmailApi(`/gmail/v1/users/me/messages?${query.toString()}`);
  const list = (await response.json()) as GmailMessageList;
  const ids = (list.messages ?? []).flatMap((message) =>
    message.id && /^[A-Za-z0-9_-]{1,256}$/.test(message.id) ? [message.id] : [],
  );
  const metadata = await mapLimit(ids, 6, getMetadata);
  const annotations = await db.gmailInboxAnnotation.findMany({
    where: { accountEmail, messageId: { in: ids } },
  });
  const annotationByMessage = new Map(annotations.map((entry) => [entry.messageId, entry]));
  const messages = metadata.flatMap((message, index) => {
    const messageId = ids[index];
    if (!messageId || !message?.labelIds?.includes("INBOX")) return [];
    const annotation = annotationByMessage.get(messageId) ?? defaultAnnotation;
    return [
      {
        messageId,
        threadId: message.threadId ?? "",
        sender: headerValue(message, "From") || "Unknown sender",
        subject: headerValue(message, "Subject") || "(No subject)",
        snippet: message.snippet ?? "",
        date: dateValue(message),
        unread: message.labelIds.includes("UNREAD"),
        annotation,
      },
    ];
  });
  return {
    accountEmail,
    messages,
    nextPageToken: list.nextPageToken ?? "",
    totalEstimate: list.resultSizeEstimate ?? messages.length,
    loadedCount: messages.length,
  };
}

export type InboxMessageDetail = InboxListItem & {
  body: string;
  bodyTruncated: boolean;
  attachments: string[];
};

export async function inboxMessageDetail(messageId: string) {
  const accountEmail = await requireQuickPassMailbox();
  if (!/^[A-Za-z0-9_-]{1,256}$/.test(messageId)) return null;
  const query = new URLSearchParams({ format: "full" });
  const response = await gmailApi(
    `/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}?${query.toString()}`,
  );
  const message = (await response.json()) as GmailMessage;
  if (!message.labelIds?.includes("INBOX")) return null;
  const annotation = await db.gmailInboxAnnotation.findUnique({
    where: { accountEmail_messageId: { accountEmail, messageId } },
  });
  const body = extractEmailBody(message.payload);
  return {
    messageId,
    threadId: message.threadId ?? "",
    sender: headerValue(message, "From") || "Unknown sender",
    subject: headerValue(message, "Subject") || "(No subject)",
    snippet: message.snippet ?? "",
    date: dateValue(message),
    unread: message.labelIds.includes("UNREAD"),
    annotation: annotation ?? defaultAnnotation,
    body: body.text,
    bodyTruncated: body.truncated,
    attachments: attachments(message),
  } satisfies InboxMessageDetail;
}

export async function moveInboxMessageToTrash(messageId: string) {
  await requireQuickPassMailbox();
  if (!/^[A-Za-z0-9_-]{1,256}$/.test(messageId))
    throw new GmailInboxError("Select a valid inbox message.");
  const message = await getMetadata(messageId);
  if (!message?.labelIds?.includes("INBOX"))
    throw new GmailInboxError("This email is no longer in the inbox.");
  try {
    await gmailApi(`/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}/trash`, {
      method: "POST",
    });
  } catch (error) {
    if (error instanceof GmailInboxError && error.status === 403)
      throw new GmailInboxError(
        "The message was not moved. Gmail Trash requires a custom OAuth connection with gmail.modify permission.",
      );
    throw error;
  }
  return { subject: headerValue(message, "Subject") || "(No subject)" };
}

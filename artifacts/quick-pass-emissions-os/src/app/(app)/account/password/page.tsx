import { redirect } from "next/navigation";

export default async function LegacyAccountPassword({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; changed?: string }>;
}) {
  const params = await searchParams;
  const query = new URLSearchParams();
  if (typeof params.error === "string") query.set("error", params.error);
  if (typeof params.changed === "string") query.set("changed", params.changed);
  redirect(`/settings/account${query.size ? `?${query}` : ""}`);
}

import { redirect } from "next/navigation";

export default async function LegacyPerformanceSetup({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const { date } = await searchParams;
  const query = new URLSearchParams();
  if (typeof date === "string") query.set("date", date);
  redirect(`/settings/station-data${query.size ? `?${query}` : ""}`);
}

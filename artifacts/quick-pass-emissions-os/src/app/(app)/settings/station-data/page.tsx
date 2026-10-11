import type { Metadata } from "next";
import { StationDataManagement } from "@/components/station-data-management";

export const metadata: Metadata = { title: "Station data | Quick Pass" };

export default async function StationDataPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  return <StationDataManagement searchParams={searchParams} />;
}

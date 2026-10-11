import { redirect } from "next/navigation";

export default function LegacyPerformanceSetup(): never {
  redirect("/settings");
}

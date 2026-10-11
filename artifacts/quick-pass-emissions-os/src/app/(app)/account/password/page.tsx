import { redirect } from "next/navigation";

export default function LegacyAccountPassword() {
  redirect("/settings/account");
}

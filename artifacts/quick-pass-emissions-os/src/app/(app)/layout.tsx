import { readPaydayAlert } from "@/modules/payroll/payday";
import { currentUser } from "@/lib/access";
import { Shell } from "@/components/shell";
import { readCertificatePortalStatus } from "@/modules/certificates/portal";
export const dynamic = "force-dynamic";
export default async function Layout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  const [certificateStatus, paydaySnapshot] = await Promise.all([
    readCertificatePortalStatus().catch(() => null),
    readPaydayAlert(user.id),
  ]);
  return (
    <Shell role={user.role} certificateStatus={certificateStatus} paydaySnapshot={paydaySnapshot}>
      {children}
    </Shell>
  );
}

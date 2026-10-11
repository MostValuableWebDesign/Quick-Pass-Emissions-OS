import { currentUser } from "@/lib/access";
import { Shell } from "@/components/shell";
import { readCertificatePortalStatus } from "@/modules/certificates/portal";
export const dynamic = "force-dynamic";
export default async function Layout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  const certificateStatus = await readCertificatePortalStatus().catch(() => null);
  return (
    <Shell role={user.role} certificateStatus={certificateStatus}>
      {children}
    </Shell>
  );
}

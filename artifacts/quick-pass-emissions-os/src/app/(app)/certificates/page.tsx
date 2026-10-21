import { currentUser } from "@/lib/access";
import { approvalRoles } from "@/modules/phase2";
import { certificateOverview } from "@/modules/certificates/service";
import { PageHeader } from "@/components/shared";
import { readCertificateInsights } from "@/modules/certificates/order-history";
import { CertificateInsights } from "@/components/certificate-insights";
export default async function Certificates() {
  const actor = await currentUser();
  const [data, insights] = await Promise.all([
    certificateOverview(actor.id),
    readCertificateInsights(),
  ]);
  const approver = approvalRoles.includes(actor.role);
  return (
    <>
      <PageHeader title="Certificate inventory" />
      {data.demo && (
        <div className="notice warning">
          DEMONSTRATION WORKSPACE · Illustrative payroll and stock records. These are not actual
          business records.
        </div>
      )}
      <CertificateInsights initial={insights} canRefresh={approver} />
    </>
  );
}

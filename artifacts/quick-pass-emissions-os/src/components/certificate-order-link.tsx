import type { Role } from "@prisma/client";
import Link from "next/link";
import { financeRoles, approvalRoles } from "@/modules/phase2";

export { CERTIFICATE_ORDER_URL } from "@/modules/certificates/portal-types";

// Navigation only. Keep this outside action forms and alert acknowledgement controls.
export function CertificateOrderLink({ role, alert = false }: { role: Role; alert?: boolean }) {
  if (!financeRoles.includes(role) || (alert && !approvalRoles.includes(role))) return null;
  return (
    <div className="space-top">
      <Link className="button" href="/certificates#portal">Order Certificates</Link>
      <p className="muted">
        Open the official purchasing portal in a secure browser tab. You control sign-in and ordering.
      </p>
      {alert && (
        <a className="text-link" href="/certificates#purchase-history">
          Review purchase requests & order records
        </a>
      )}
    </div>
  );
}

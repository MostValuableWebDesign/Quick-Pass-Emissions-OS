import type { Role } from "@prisma/client";
import Link from "next/link";
import { FileCheck2 } from "lucide-react";
import { financeRoles, approvalRoles } from "@/modules/phase2";

export { CERTIFICATE_ORDER_URL } from "@/modules/certificates/portal-types";

// Navigation only. Keep this outside action forms and alert acknowledgement controls.
export function CertificateOrderLink({
  role,
  alert = false,
  compact = false,
}: {
  role: Role;
  alert?: boolean;
  compact?: boolean;
}) {
  if (!financeRoles.includes(role) || (alert && !approvalRoles.includes(role))) return null;
  return (
    <div className={compact ? undefined : "space-top"}>
      <Link className="button" href="/certificates#portal">
        <FileCheck2 size={17} aria-hidden="true" />
        Order Certificates
      </Link>
      <p className="muted">
        Open the official purchasing portal in a secure browser tab. You control sign-in and
        ordering.
      </p>
    </div>
  );
}

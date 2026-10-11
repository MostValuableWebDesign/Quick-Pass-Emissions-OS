import type { Role } from "@prisma/client";
import Link from "next/link";
import { financeRoles, approvalRoles } from "@/modules/phase2";

export const CERTIFICATE_ORDER_URL = "https://gadashboard.com/Purchasing/Purchasing.aspx";

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
      <a className="button" href={CERTIFICATE_ORDER_URL} target="_blank" rel="noopener noreferrer">
        Order Certificates <span className="sr-only">· external Georgia dashboard, new tab</span>
      </a>
      <p className="muted">
        {compact
          ? "Opens the official Georgia dashboard in a new tab. Log in and order on that portal."
          : "Opens the official Georgia dashboard in a new browser tab. Login and ordering happen on that portal. If login takes you elsewhere, return here and select Order Certificates again."}
      </p>
      {alert && (
        <Link className="text-link" href="/certificates#purchase-history">
          Review purchase requests & order records
        </Link>
      )}
    </div>
  );
}

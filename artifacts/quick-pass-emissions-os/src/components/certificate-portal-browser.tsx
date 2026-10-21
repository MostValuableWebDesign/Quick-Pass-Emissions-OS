import type { ReactNode } from "react";
import type { CertificatePortalStatus } from "@/modules/certificates/portal-types";

export function CertificatePortalBrowser({
  initial,
  actions,
}: {
  initial: CertificatePortalStatus | null;
  actions: ReactNode;
}) {
  return (
    <section
      className="certificate-portal-header"
      id="portal"
      aria-label="Certificate purchasing portal"
    >
      <div className="portal-head">
        <div>
          <dl className="portal-ids">
            <div>
              <dt>Station</dt>
              <dd data-testid="text-station">
                {initial?.station ?? "GA102539 - QUICK PASS EMISSIONS INC"}
              </dd>
            </div>
            <div>
              <dt>Analyzer</dt>
              <dd data-testid="text-analyzer">{initial?.analyzer ?? "HT111411"}</dd>
            </div>
          </dl>
        </div>
        {actions}
      </div>
    </section>
  );
}

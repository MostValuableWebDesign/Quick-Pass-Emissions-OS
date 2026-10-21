import { ExternalLink } from "lucide-react";
import type { CertificatePortalStatus } from "@/modules/certificates/portal-types";
import { CERTIFICATE_ORDER_URL } from "@/modules/certificates/portal-types";

export function CertificatePortalBrowser({ initial }: { initial: CertificatePortalStatus | null }) {
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
        <a
          className="button button-primary button-sm"
          href={CERTIFICATE_ORDER_URL}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="link-open-portal"
        >
          <ExternalLink size={14} aria-hidden="true" /> Open Georgia dashboard
        </a>
      </div>
    </section>
  );
}

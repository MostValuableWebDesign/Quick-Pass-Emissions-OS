import type { Metadata } from "next";
import { ExternalLink, ShieldCheck, Video } from "lucide-react";
import { manager } from "@/lib/access";
import { PageHeader } from "@/components/shared";

export const metadata: Metadata = { title: "Camera viewing" };

export default async function SecurityPage() {
  await manager();
  return (
    <>
      <PageHeader
        eyebrow="QUICK PASS SECURITY"
        title="Camera viewing"
        description="Open Reolink’s software to view the standalone Argus PT camera."
      >
        <span className="badge neutral">Standalone camera</span>
      </PageHeader>
      <div className="two-columns">
        <section className="card" aria-labelledby="camera-system-title">
          <div className="card-heading">
            <div>
              <h2 id="camera-system-title">Reolink Argus PT</h2>
              <p>Managed in Reolink software</p>
            </div>
            <span className="badge neutral">Standalone</span>
          </div>
          <div className="card-body">
            <Video size={32} aria-hidden="true" />
            <h3>View this camera in Reolink</h3>
            <p>
              The Argus PT is listed separately from your NVR. Use Reolink’s official app on mobile
              or Reolink Client on desktop to view and control it.
            </p>
            <a
              className="button button-primary"
              href="https://reolink.com/software-and-manual/"
              target="_blank"
              rel="noopener noreferrer"
            >
              Reolink apps and client
              <ExternalLink size={16} aria-hidden="true" />
            </a>
          </div>
        </section>
        <section className="card" aria-labelledby="camera-setup-title">
          <div className="card-heading">
            <h2 id="camera-setup-title">Connection and recordings</h2>
            <ShieldCheck size={20} aria-hidden="true" />
          </div>
          <div className="card-body">
            <p>
              Quick Pass opens Reolink’s official software. It does not stream, control, or store
              camera video, and no camera credentials are stored here.
            </p>
            <p className="muted">
              This standalone camera is separate from the NVR. Camera microSD recordings, if a card
              is installed, are also separate from NVR recordings.
            </p>
            <p className="muted">This area is available only to owners and management.</p>
          </div>
        </section>
      </div>
    </>
  );
}

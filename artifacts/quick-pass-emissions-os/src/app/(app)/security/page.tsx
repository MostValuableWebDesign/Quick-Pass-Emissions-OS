import type { Metadata } from "next";
import { Video, ShieldCheck } from "lucide-react";
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
        description="A dedicated space for viewing your business cameras within Quick Pass Emissions."
      >
        <span className="badge neutral">Coming soon</span>
      </PageHeader>
      <div className="two-columns">
        <section className="card" aria-labelledby="camera-system-title">
          <div className="card-heading">
            <div>
              <h2 id="camera-system-title">Reolink camera system</h2>
              <p>Future browser viewing</p>
            </div>
            <span className="badge neutral">Not connected</span>
          </div>
          <div className="empty">
            <Video size={36} aria-hidden="true" />
            <h3>Camera viewing is coming</h3>
            <p>
              This space is reserved for your Reolink cameras. Live viewing is planned, pending
              connection setup and browser compatibility checks.
            </p>
          </div>
        </section>
        <section className="card" aria-labelledby="camera-setup-title">
          <div className="card-heading">
            <h2 id="camera-setup-title">When you’re ready</h2>
            <ShieldCheck size={20} aria-hidden="true" />
          </div>
          <div className="card-body">
            <p>
              Setup can begin when the camera or recorder model and secure access details are
              available.
            </p>
            <p className="muted">
              We’ll check browser playback and whether the view can be displayed inside this page.
              Compatibility has not been confirmed yet.
            </p>
            <p className="muted">This area is available only to owners and management.</p>
          </div>
        </section>
      </div>
    </>
  );
}

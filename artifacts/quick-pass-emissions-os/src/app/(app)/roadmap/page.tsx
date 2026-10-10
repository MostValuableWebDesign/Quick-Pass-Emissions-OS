import { currentUser } from "@/lib/access";
import { PageHeader } from "@/components/shared";
export default async function Roadmap() {
  await currentUser();
  return (
    <>
      <PageHeader
        title="Built in deliberate steps"
        description="Operations, payroll, inventory, maintenance, rentals, billing and internal automation are available locally. Publication and a real persistent scheduler require separate setup."
      />
      <div className="roadmap-grid">
        {[
          {
            phase: 2,
            title: "Payroll & certificates",
            text: "Emissions operations, commission policies, payroll preparation, certificate inventory, and purchase approvals.",
          },
          {
            phase: 3,
            title: "Carwash & maintenance",
            text: "Six-bay registry, equipment, vendor records, rental agreements, and preventative maintenance.",
          },
          {
            phase: 4,
            title: "Dealerships & finance",
            text: "Dealership accounts, invoices, receivables, operational finance, and financial reports.",
          },
          {
            phase: 5,
            title: "Automation & insight",
            text: "Owner snapshots, source-linked internal reminders, inventory estimates, complete operational CSV and durable independently triggered jobs. External sending stays disabled.",
          },
        ].map((p) => (
          <section className="card card-body" key={p.phase}>
            <span className="badge neutral">Phase {p.phase} · Implemented locally</span>
            <h2>{p.title}</h2>
            <p className="muted">{p.text}</p>
          </section>
        ))}
      </div>
    </>
  );
}

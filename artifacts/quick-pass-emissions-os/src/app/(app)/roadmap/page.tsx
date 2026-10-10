import { currentUser } from "@/lib/access";
import { PageHeader } from "@/components/shared";
export default async function Roadmap() {
  await currentUser();
  return (
    <>
      <PageHeader
        title="Built in deliberate steps"
        description="Operations, payroll, inventory, carwash, maintenance, and rentals are available. Phases 4–5 remain planned."
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
            text: "Owner reporting, advanced notifications, inventory forecasts, and approved integrations.",
          },
        ].map((p) => (
          <section className="card card-body" key={p.phase}>
            <span className="badge neutral">
              Phase {p.phase} · {p.phase <= 3 ? "Implemented" : "Planned"}
            </span>
            <h2>{p.title}</h2>
            <p className="muted">{p.text}</p>
          </section>
        ))}
      </div>
    </>
  );
}

import { requireRole } from "@/lib/require-role";
import { ownerEmailReport } from "@/modules/automation/owner-email";
import { PageHeader } from "@/components/shared";
export default async function Report({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole(["OWNER"]);
  const report = await ownerEmailReport(user.id, (await params).id);
  return (
    <>
      <PageHeader
        title={`Saved owner report · ${report.date}`}
        description="Historical copy captured at generation; later entries do not change this report."
      />
      <section className="card card-body">
        <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontFamily: "inherit" }}>
          {report.text}
        </pre>
      </section>
    </>
  );
}

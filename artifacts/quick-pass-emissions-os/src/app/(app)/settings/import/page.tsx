import { currentUser } from "@/lib/access";
import { PageHeader } from "@/components/shared";
import { BusinessImportPanel } from "@/components/business-import-panel";
import { importHistory } from "@/modules/business-import/service";
import type { PlannedItem } from "@/modules/business-import/rules";
export default async function ImportConfiguration() {
  const actor = await currentUser();
  const history = await importHistory(actor.id);
  return (
    <>
      <PageHeader
        title="Business configuration import & review"
        description="Owner-only source review. No payroll, transactions, stock movements, schedules or login identities are imported."
      />
      <p className="notice">
        Only supported blank reference fields can be populated. Existing nonblank fields are
        preserved. Supplier verification, compensation, commission attribution, identity mappings,
        units and operating/layout decisions require separate review. Configure private
        DATA_BACKUP_DIR before web application.
      </p>
      <BusinessImportPanel />
      <section className="card card-body space-top">
        <h2>Saved manifests & unresolved decisions</h2>
        {!history.length && (
          <p>No imports applied. Missing configuration remains unknown, not zero.</p>
        )}
        {history.map((run) => (
          <details key={run.id}>
            <summary>
              {run.sourceName} · {run.createdAt.toISOString().slice(0, 10)} · View import and review
              list
            </summary>
            <p>
              Source fingerprint: <code className="audit-details">{run.sourceFingerprint}</code>
            </p>
            <p>
              Counts: <code>{JSON.stringify(run.counts)}</code>
            </p>
            {(run.items as unknown as PlannedItem[]).map((item) => (
              <div key={item.key} className="list-row">
                <div>
                  <strong>
                    {item.key} · {item.outcome.toLowerCase()}
                  </strong>
                  <p>{item.message}</p>
                  <p>Source: {item.section}</p>
                  <p>Requires review: {item.missing.join("; ")}</p>
                  <details>
                    <summary>Field evidence</summary>
                    <pre className="audit-details">
                      {JSON.stringify(
                        {
                          before: item.before,
                          proposed: item.proposed,
                          applied: item.after,
                          actor: item.appliedBy,
                        },
                        null,
                        2,
                      )}
                    </pre>
                  </details>
                </div>
              </div>
            ))}
          </details>
        ))}
      </section>
    </>
  );
}

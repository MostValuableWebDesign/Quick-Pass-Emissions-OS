import { currentUser } from "@/lib/access";
import { ownCertification } from "@/modules/automation/service";
import { PageHeader } from "@/components/shared";
export default async function Certification() {
  const user = await currentUser(),
    profile = await ownCertification(user.id);
  return (
    <>
      <PageHeader
        title="My certification"
        description="Your current recorded expiration date. No peer or private management records."
      />
      <section className="card card-body">
        <p>
          {profile?.certificationExpires
            ? `Current recorded expiry: ${profile.certificationExpires} (America/New_York calendar date).`
            : "No certification expiration is recorded. Ask an authorized manager to verify your record."}
        </p>
      </section>
    </>
  );
}

import Link from "next/link";
import { currentUser } from "@/lib/access";

import { directory } from "@/modules/support/service";
import { CATEGORIES } from "@/modules/support/rules";
import { PageHeader, Empty } from "@/components/shared";
import { ActionForm, Field } from "@/components/action-form";
import { DemoNotice, Reason } from "@/components/phase3";
import { ContactLine } from "@/components/support-contact";
import { VendorForm } from "@/components/support-vendor-form";
import { setPreference } from "@/app/support-actions";

export default async function Vendors({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; category?: string; archived?: string }>;
}) {
  const q = await searchParams;
  const category = (CATEGORIES as readonly string[]).includes(q.category ?? "")
    ? q.category
    : undefined;
  const actor = await currentUser();
  const data = await directory(actor.id, {
    search: q.search,
    category,
    archived: q.archived === "1",
  });
  const preferredBy = new Map<string, string[]>();
  for (const p of data.preferences)
    if (p.vendorId)
      preferredBy.set(p.vendorId, [...(preferredBy.get(p.vendorId) ?? []), p.category]);
  return (
    <>
      <PageHeader
        title="Service & support"
        description="Who to contact when equipment, cameras, drains or wash systems need help. Calling, emailing or opening a link does not record anything; log contacts manually on a provider's page."
      />
      <DemoNotice demo={data.demo} />
      <form
        method="get"
        className="card card-body form-grid"
        role="search"
        aria-label="Filter providers"
      >
        <Field label="Search name, contact or services">
          <input type="search" name="search" defaultValue={q.search ?? ""} maxLength={160} />
        </Field>
        <Field label="Category">
          <select name="category" defaultValue={category ?? ""}>
            <option value="">All categories</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>
        <div className="field">
          <label>
            <input type="checkbox" name="archived" value="1" defaultChecked={q.archived === "1"} />{" "}
            Include archived providers
          </label>
        </div>
        <div className="form-footer">
          <button type="submit" className="badge neutral">
            Apply filters
          </button>
          <Link href="/vendors">Clear</Link>
        </div>
      </form>
      <p className="muted space-top">
        Phone links open your device&apos;s calling app. On a desktop without an installed calling
        app, the link may do nothing; copy the number instead.
      </p>
      <p className="muted">
        Check the recorded confirmation date before relying on older details. No freshness interval,
        business hours or emergency availability is assumed. Email links require an installed email
        app.
      </p>
      {data.providers.length === 0 ? (
        <Empty
          title="No providers match"
          text="Try a different search or category, or include archived providers."
        />
      ) : (
        <div className="two-columns space-top">
          {data.providers.map((p) => {
            const missing =
              !p.phone &&
              !p.email &&
              !p.alternatePhone &&
              !p.alternateEmail &&
              !p.emergencyPhone &&
              !p.supportUrl &&
              !p.website;
            return (
              <section className="card card-body" key={p.id}>
                <h2>
                  <Link href={`/vendors/${p.id}`}>{p.name}</Link>
                </h2>
                <p style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
                  <span className={p.active ? "badge green" : "badge neutral"}>
                    {p.active ? "Active" : "Archived"}
                  </span>
                  {p.verifiedDate ? (
                    <span className="badge green">Verified contact {p.verifiedDate}</span>
                  ) : (
                    <span className="badge amber">Document-sourced · unconfirmed</span>
                  )}
                  {(preferredBy.get(p.id) ?? []).map((c) => (
                    <span key={c} className="badge">
                      Preferred: {c}
                    </span>
                  ))}
                </p>
                <p className="muted">
                  Last confirmed: {p.lastConfirmedDate ? p.lastConfirmedDate : "not recorded"}
                </p>
                {p.categories.length > 0 && <p>{p.categories.join(" · ")}</p>}
                {!p.verifiedDate && (
                  <p className="notice">
                    Source-provided reference only. Confirm independently before relying on it.
                  </p>
                )}
                {p.contact && <p>Contact: {p.contact}</p>}
                <ContactLine kind="phone" label="Phone" value={p.phone} extension={p.extension} />
                <ContactLine kind="email" label="Email" value={p.email} />
                <ContactLine kind="phone" label="Emergency phone" value={p.emergencyPhone} />
                {missing && <p className="notice">No contact method recorded.</p>}
                <Link href={`/vendors/${p.id}`}>Full details and contact history</Link>
              </section>
            );
          })}
        </div>
      )}
      {data.management && (
        <>
          <section className="card card-body space-top">
            <h2>Preferred provider by category</h2>
            <p className="muted">
              Only active, verified providers listed in that category can be preferred. Choose none
              to clear.
            </p>
            <div className="two-columns">
              {CATEGORIES.map((c) => {
                const pref = data.preferences.find((p) => p.category === c);
                const choices = data.preferenceChoices.filter((p) => p.categories.includes(c));
                return (
                  <ActionForm key={c} action={setPreference} submit="Save preference">
                    <h3 className="wide">{c}</h3>
                    <input type="hidden" name="category" value={c} />
                    <input type="hidden" name="version" value={pref?.version ?? 0} />
                    <Field label={`Preferred provider for ${c}`}>
                      <select name="vendorId" defaultValue={pref?.vendorId ?? ""}>
                        <option value="">None</option>
                        {choices.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Reason />
                  </ActionForm>
                );
              })}
            </div>
          </section>
          <section className="card card-body space-top">
            <h2>Add a verified vendor</h2>
            <VendorForm />
          </section>
        </>
      )}
    </>
  );
}

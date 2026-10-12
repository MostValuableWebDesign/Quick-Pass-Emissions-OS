import Link from "next/link";
import { currentUser } from "@/lib/access";

import { directory } from "@/modules/support/service";
import { CATEGORIES } from "@/modules/support/rules";
import { PageHeader, Empty } from "@/components/shared";
import { DemoNotice } from "@/components/phase3";
import { ContactLine } from "@/components/support-contact";
import { VendorForm } from "@/components/support-vendor-form";

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
  return (
    <>
      <PageHeader
        title="Service & support"
      />
      <DemoNotice demo={data.demo} />
      {data.management && (
        <div className="directory-add-toolbar">
          <details className="directory-add-details">
            <summary className="button button-primary dealership-add-toggle vendor-add-toggle">
              Add vendor
            </summary>
            <div className="directory-add-form">
              <p className="muted">
                Vendor name and phone are required. New vendors remain unconfirmed until their
                contact details are verified.
              </p>
              <VendorForm />
            </div>
          </details>
        </div>
      )}
      <form
        key={JSON.stringify([q.search ?? "", category ?? "", q.archived === "1"])}
        method="get"
        className="card card-body form-grid"
        role="search"
        aria-label="Filter providers"
      >
        <div className="field">
          <label htmlFor="provider-search">Search name, contact or services</label>
          <input
            id="provider-search"
            type="search"
            name="search"
            defaultValue={q.search ?? ""}
            maxLength={160}
          />
        </div>
        <div className="field">
          <label htmlFor="provider-category">Category</label>
          <select id="provider-category" name="category" defaultValue={category ?? ""}>
            <option value="">All categories</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="form-footer">
          <button type="submit" className="badge neutral">
            Apply filters
          </button>
          <Link href="/vendors">Clear</Link>
        </div>
      </form>
      {data.providers.length === 0 ? (
        <Empty
          title="No providers match"
          text="Try a different search or category."
        />
      ) : (
        <div className="vendor-directory-grid">
          {data.providers.map((p) => {
            const description = p.supportedServices?.trim() || p.services?.trim();
            return (
              <section className="card vendor-directory-card" key={p.id}>
                <div className="vendor-directory-heading">
                  <h2>
                    <Link href={`/vendors/${p.id}`}>{p.name}</Link>
                  </h2>
                  {!p.active && <span className="badge neutral">Archived</span>}
                </div>
                <div className="vendor-directory-categories">
                  <span className="eyebrow">Category</span>
                  <div className="vendor-category-list">
                    {p.categories.length ? (
                      p.categories.map((category) => (
                        <span className="badge neutral" key={category}>
                          {category}
                        </span>
                      ))
                    ) : (
                      <span className="muted">Not categorized</span>
                    )}
                  </div>
                </div>
                <div className="vendor-directory-description">
                  <p>{description || "No description recorded."}</p>
                </div>
                {p.phone ? (
                  <ContactLine
                    kind="phone"
                    label="Phone"
                    value={p.phone}
                    extension={p.extension}
                    showLabel={false}
                  />
                ) : (
                  <p className="muted vendor-directory-missing">No number recorded</p>
                )}
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}

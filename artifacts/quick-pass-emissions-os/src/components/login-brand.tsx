import { CheckCheck } from "lucide-react";

export function LoginBrand() {
  return (
    <section className="login-brand" aria-label="Quick Pass Emissions">
      <div className="login-wordmark">
        <span className="login-mark" aria-hidden="true">
          <CheckCheck size={27} strokeWidth={1.7} />
        </span>
        <span>
          Quick Pass<span className="login-wordmark-detail">Emissions</span>
        </span>
      </div>
      <div className="login-story">
        <p className="login-kicker">THE BUSINESS, IN FOCUS</p>
        <h1>
          Every detail.
          <br />
          <span>Under control.</span>
        </h1>
        <p className="login-story-copy">
          A clear view of your testing, your team, and the work that keeps your business moving.
        </p>
        <dl className="login-business-areas">
          <div>
            <dt>
              <span aria-hidden="true">01</span> Emissions
            </dt>
            <dd>Test records & performance</dd>
          </div>
          <div>
            <dt>
              <span aria-hidden="true">02</span> People
            </dt>
            <dd>Payroll & commissions</dd>
          </div>
          <div>
            <dt>
              <span aria-hidden="true">03</span> Operations
            </dt>
            <dd>Inventory & maintenance</dd>
          </div>
        </dl>
      </div>
      <footer className="login-brand-footer">
        <span>QUICK PASS EMISSIONS</span>
        <span>OWNERS & MANAGEMENT</span>
      </footer>
    </section>
  );
}

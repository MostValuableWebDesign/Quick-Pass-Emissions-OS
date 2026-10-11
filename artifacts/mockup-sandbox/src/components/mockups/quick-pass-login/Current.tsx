import { ArrowRight, LockKeyhole, CheckCheck } from "lucide-react";
import "./_group.css";


function CurrentBrand() {
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

export function Current() {
 const error = "";
  return (
    <div className="login-page login-professional">
      <CurrentBrand />
      <section className="login-panel" aria-labelledby="sign-in-heading">
        <form className="login-form" onSubmit={(event) => event.preventDefault()}>
          <p className="login-access-label">
            <LockKeyhole size={14} aria-hidden="true" /> MANAGEMENT WORKSPACE
          </p>
          <h2 id="sign-in-heading">Sign in.</h2>
          <p className="muted">Welcome back to Quick Pass Emissions.</p>
          <label className="field">
            <span>Email address</span>
            <input
              name="email"
              type="email"
              autoComplete="username"
              placeholder="name@company.com"
              spellCheck={false}
              autoCapitalize="none"
              required
            />
          </label>
          <label className="field">
            <span>Password</span>
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              placeholder="Enter your password"
              minLength={12}
              maxLength={128}
              required
            />
          </label>
          {error && (
            <p role="alert" className="error-text">
              {error}
            </p>
          )}
          <button className="button button-primary" type="button">
            Sign in
            <ArrowRight size={17} aria-hidden="true" />
          </button>
          <p className="login-help">
            For owners and management only.
            <br />
            Need access? Contact your account owner.
          </p>
        </form>
      </section>
    </div>
  );
}

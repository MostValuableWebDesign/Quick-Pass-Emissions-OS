import { ArrowRight, LockKeyhole, CheckCheck } from "lucide-react";
import "./_group.css";
import "./_service.css";

function ServiceWelcomeBrand() {
  return (
    <section className="login-brand qp-brand" aria-label="Quick Pass Emissions">
      <div className="login-wordmark">
        <span className="login-mark" aria-hidden="true">
          <CheckCheck size={27} strokeWidth={1.7} />
        </span>
        <span>
          Quick Pass<span className="login-wordmark-detail">Emissions</span>
        </span>
      </div>
      <div className="login-story qp-story">
        <p className="login-kicker">GEORGIA VEHICLE INSPECTIONS</p>
        <h1>
          Quick Pass
          <br />
          <span>Emissions</span>
        </h1>
        <p className="qp-greeting">How May I Help You?</p>
        <p className="login-story-copy">
          Friendly service. Clear results. Confidence on the road.
        </p>
      </div>
      <figure className="qp-photo">
        <img
          src="/__mockup/images/quick-pass-diagnostics.jpg"
          alt="A technician using a diagnostic tablet inside a vehicle"
        />
        <figcaption>
          <span className="qp-photo-mark" aria-hidden="true">
            <CheckCheck size={15} strokeWidth={1.8} />
          </span>
          A clear check. A confident drive.
        </figcaption>
      </figure>
      <footer className="login-brand-footer">
        <span>QUICK PASS EMISSIONS</span>
        <span>HERE TO HELP</span>
      </footer>
    </section>
  );
}

export function ServiceWelcome() {
  const error = "";
  return (
    <div className="login-page login-professional">
      <ServiceWelcomeBrand />
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

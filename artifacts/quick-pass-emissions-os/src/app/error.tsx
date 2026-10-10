"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="invite-page">
      <section className="card card-body">
        <h1>We couldn’t open this view.</h1>
        <p>Check your access and database connection, then try again.</p>
        <button className="button button-primary" onClick={reset}>
          Try again
        </button>
        <a className="text-link" href="/dashboard">
          Return to dashboard
        </a>
      </section>
    </main>
  );
}

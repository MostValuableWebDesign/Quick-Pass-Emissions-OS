import Link from "next/link";
export default function NotFound() {
  return (
    <div className="empty">
      <h1>Page not available</h1>
      <p>The record may not exist or you may not have access.</p>
      <Link className="text-link" href="/dashboard">
        Return to dashboard
      </Link>
    </div>
  );
}

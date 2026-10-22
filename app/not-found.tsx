import Link from "next/link";
export default function NotFound() {
  return (
    <div className="empty" style={{ marginTop: 40 }}>
      <h1 style={{ font: "700 2rem var(--f-display)", color: "var(--ink)" }}>That page is not on the shelf</h1>
      <p>The link may be old, or the SKU may not be in the latest run.</p>
      <p><Link className="btn primary" href="/">Back to Today</Link> <Link className="btn" href="/recommendations">All SKUs</Link></p>
    </div>
  );
}

import "@/components/performance-dashboard.css";

export default function Loading() {
  return (
    <div className="pd" aria-busy="true" aria-label="Loading performance">
      <div className="pd-skel" style={{ height: 56, width: "40%" }} />
      <div className="pd-kpis">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="pd-skel" style={{ height: 118 }} />
        ))}
      </div>
      <div className="pd-skel" style={{ height: 300 }} />
      <div className="pd-skel" style={{ height: 240 }} />
    </div>
  );
}

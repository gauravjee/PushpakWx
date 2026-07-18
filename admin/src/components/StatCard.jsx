export default function StatCard({ label, value, accent }) {
  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className={`stat-value${accent ? ` ${accent}` : ''}`}>{value}</div>
    </div>
  )
}

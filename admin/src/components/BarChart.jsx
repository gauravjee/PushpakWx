export default function BarChart({ data }) {
  const max = Math.max(1, ...data.map((d) => d.count))
  return (
    <div className="bar-chart">
      {data.map((d) => (
        <div className="bar-col" key={d.date} title={`${d.date}: ${d.count}`}>
          <div className="bar" style={{ height: `${Math.max(2, (d.count / max) * 100)}%` }} />
        </div>
      ))}
    </div>
  )
}

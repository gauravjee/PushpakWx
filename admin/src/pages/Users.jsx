import { useEffect, useState } from 'react'
import { getUsers } from '../api'

function formatDate(ts) {
  if (!ts) return '—'
  try {
    return new Date(ts).toLocaleString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    })
  } catch {
    return ts
  }
}

export default function Users() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)
  const [q, setQ] = useState('')
  const [qInput, setQInput] = useState('')
  const limit = 25

  useEffect(() => {
    getUsers({ page, limit, q }).then(setData).catch((e) => setError(e.message))
  }, [page, q])

  function handleSearch(e) {
    e.preventDefault()
    setPage(1)
    setQ(qInput.trim())
  }

  if (error) return <div className="empty-state">{error}</div>

  const totalPages = data ? Math.max(1, Math.ceil(data.total / limit)) : 1

  return (
    <div>
      <h1 className="page-title">Registered users</h1>
      <p className="page-sub">{data ? `${data.total} total` : 'Loading…'}</p>

      <form onSubmit={handleSearch} style={{ marginBottom: 20 }}>
        <input
          className="search-input"
          placeholder="Search by name or email…"
          value={qInput}
          onChange={(e) => setQInput(e.target.value)}
        />
      </form>

      <div className="panel">
        {!data && <div className="loading-state">Loading users…</div>}
        {data && data.items.length === 0 && <div className="empty-state">No users match this search.</div>}
        {data && data.items.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Joined</th>
                <th>Last login</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((u) => (
                <tr key={u.id}>
                  <td style={{ fontFamily: 'var(--font-body)' }}>{u.full_name || '—'}</td>
                  <td>{u.email}</td>
                  <td>{formatDate(u.created_at)}</td>
                  <td>{formatDate(u.last_login)}</td>
                  <td>
                    {u.is_admin && <span className="badge admin" style={{ marginRight: 6 }}>Admin</span>}
                    <span className={`badge ${u.email_verified ? 'ok' : 'pending'}`}>
                      {u.email_verified ? 'Verified' : 'Pending'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {data && data.total > limit && (
          <div className="pager">
            <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
            <span>Page {page} of {totalPages}</span>
            <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</button>
          </div>
        )}
      </div>
    </div>
  )
}

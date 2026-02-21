import { Link } from 'react-router-dom';

export default function ErrorFallback() {
  return (
    <div style={{ minHeight: '70vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
      <div className="card" style={{ maxWidth: 620, width: '100%' }}>
        <div className="card-body" style={{ textAlign: 'center' }}>
          <h1 style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>Something went wrong</h1>
          <p className="text-muted" style={{ marginBottom: '1.25rem' }}>
            An unexpected error occurred. Please retry or return to the dashboard.
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '0.75rem' }}>
            <button className="btn btn-secondary" onClick={() => window.location.reload()}>Reload page</button>
            <Link to="/login" className="btn btn-primary">Login again</Link>
          </div>
        </div>
      </div>
    </div>
  );
}

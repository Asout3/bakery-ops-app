import './ErrorFallback.css';

export default function ErrorFallback() {
  return (
    <div className="error-fallback-page">
      <div className="card error-fallback-card">
        <div className="card-body" style={{ textAlign: 'center' }}>
          <h1 className="error-fallback-title">Something went wrong</h1>
          <p className="error-fallback-text">
            An unexpected error occurred. Please retry or return to the dashboard.
          </p>
          <div className="error-fallback-actions">
            <button className="btn btn-secondary" onClick={() => window.location.reload()}>Reload page</button>
            <button className="btn btn-primary" onClick={() => { window.location.href = '/login'; }}>Login again</button>
          </div>
        </div>
      </div>
    </div>
  );
}

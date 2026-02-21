import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div style={{ minHeight: '70vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
      <div className="card" style={{ maxWidth: 540, width: '100%' }}>
        <div className="card-body" style={{ textAlign: 'center' }}>
          <h1 style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>404</h1>
          <h2 style={{ marginBottom: '0.75rem' }}>Page not found</h2>
          <p className="text-muted" style={{ marginBottom: '1.25rem' }}>
            The page you requested does not exist or may have been moved.
          </p>
          <Link to="/login" className="btn btn-primary">Go to login</Link>
        </div>
      </div>
    </div>
  );
}

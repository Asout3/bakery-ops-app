import { useEffect, useState } from 'react';
import api from '../../api/axios';
import { useBranch } from '../../context/BranchContext';
import { Package, Clock, User, Eye } from 'lucide-react';

export default function ManagerBatches() {
  const { selectedLocationId } = useBranch();
  const [batches, setBatches] = useState([]);
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchBatches();
  }, [selectedLocationId]);

  const fetchBatches = async () => {
    try {
      const response = await api.get('/inventory/batches?limit=100');
      setBatches(response.data);
    } catch (err) {
      console.error('Failed to fetch batches:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchBatchDetails = async (batchId) => {
    try {
      const response = await api.get(`/inventory/batches/${batchId}`);
      setSelectedBatch(response.data);
    } catch (err) {
      console.error('Failed to fetch batch details:', err);
    }
  };

  if (loading) {
    return <div className="loading-container"><div className="spinner"></div></div>;
  }

  return (
    <div className="inventory-page">
      <div className="page-header">
        <h2>Batch History</h2>
      </div>

      <div className="stats-grid mb-4">
        <div className="stat-card card bg-light">
          <div className="stat-icon bg-primary text-white"><Package size={24} /></div>
          <div className="stat-content"><h3>{batches.length}</h3><p>Total Batches</p></div>
        </div>
      </div>

      <div className="card">
        <div className="card-body">
          <div className="table-responsive">
            <table className="table table-hover">
              <thead>
                <tr>
                  <th>Batch ID</th>
                  <th>Date</th>
                  <th>Status</th>
                  <th>Items</th>
                  <th>Created By</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {batches.map((batch) => (
                  <tr key={batch.id}>
                    <td>#{batch.id}</td>
                    <td>{new Date(batch.created_at).toLocaleString()}</td>
                    <td><span className="badge badge-success">{batch.status}</span></td>
                    <td>{batch.items_count}</td>
                    <td>{batch.created_by_name}</td>
                    <td>
                      <button className="btn btn-sm btn-outline-primary" onClick={() => fetchBatchDetails(batch.id)}>
                        <Eye size={14} /> View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {selectedBatch && (
        <div className="modal-overlay" onClick={() => setSelectedBatch(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Batch #{selectedBatch.id}</h3>
              <button className="close-btn" onClick={() => setSelectedBatch(null)}>×</button>
            </div>
            <div className="modal-body">
              <p><Clock size={14} /> {new Date(selectedBatch.created_at).toLocaleString()}</p>
              <p><User size={14} /> {selectedBatch.created_by_name}</p>
              <p>Status: <strong>{selectedBatch.status}</strong></p>
              <hr />
              <h4>Items</h4>
              <ul>
                {selectedBatch.items?.map((item) => (
                  <li key={item.id}>
                    {item.product_name} — {item.quantity} {item.unit} ({item.source})
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

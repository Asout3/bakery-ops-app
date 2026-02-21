import { useEffect, useState } from 'react';
import api, { getErrorMessage } from '../../api/axios';
import { useBranch } from '../../context/BranchContext';
import { Package, Clock, User, Eye, Edit, Ban } from 'lucide-react';

export default function ManagerBatches() {
  const { selectedLocationId } = useBranch();
  const [batches, setBatches] = useState([]);
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [editingItems, setEditingItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    fetchBatches();
  }, [selectedLocationId]);

  const fetchBatches = async () => {
    try {
      const response = await api.get('/inventory/batches?limit=100');
      setBatches(response.data || []);
    } catch (err) {
      setMessage({ type: 'danger', text: getErrorMessage(err, 'Failed to fetch batches.') });
    } finally {
      setLoading(false);
    }
  };

  const fetchBatchDetails = async (batchId) => {
    try {
      const response = await api.get(`/inventory/batches/${batchId}`);
      setSelectedBatch(response.data);
      setEditingItems(response.data.items?.map((item) => ({ ...item })) || []);
    } catch (err) {
      setMessage({ type: 'danger', text: getErrorMessage(err, 'Failed to fetch batch details.') });
    }
  };

  const handleVoidBatch = async (batchId) => {
    try {
      await api.post(`/inventory/batches/${batchId}/void`);
      setMessage({ type: 'success', text: `Batch #${batchId} was voided.` });
      setSelectedBatch(null);
      fetchBatches();
    } catch (err) {
      setMessage({ type: 'danger', text: getErrorMessage(err, 'Failed to void batch.') });
    }
  };

  const handleSaveEdit = async () => {
    if (!selectedBatch) return;

    try {
      await api.put(`/inventory/batches/${selectedBatch.id}`, {
        items: editingItems.map((item) => ({
          product_id: item.product_id,
          quantity: Number(item.quantity),
          source: item.source,
        })),
        notes: selectedBatch.notes,
      });
      setMessage({ type: 'success', text: `Batch #${selectedBatch.id} updated.` });
      await fetchBatchDetails(selectedBatch.id);
      await fetchBatches();
    } catch (err) {
      setMessage({ type: 'danger', text: getErrorMessage(err, 'Failed to update batch.') });
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

      {message && <div className={`alert alert-${message.type} mb-3`}>{message.text}</div>}

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
                  <th>Total Cost</th>
                  <th>Created By</th>
                  <th>Sync Source</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {batches.map((batch) => (
                  <tr key={batch.id}>
                    <td>#{batch.id}</td>
                    <td>{new Date(batch.created_at).toLocaleString()}</td>
                    <td><span className={`badge ${batch.status === 'voided' ? 'badge-danger' : 'badge-success'}`}>{batch.status}</span></td>
                    <td>{batch.items_count}</td>
                    <td>ETB {Number(batch.total_cost || 0).toFixed(2)}</td>
                    <td>{batch.created_by_name}</td>
                    <td>{batch.is_offline ? <span className="badge badge-warning">Offline</span> : <span className="badge badge-success">Online</span>}</td>
                    <td style={{ display: 'flex', gap: '0.4rem' }}>
                      <button className="btn btn-sm btn-outline-primary" onClick={() => fetchBatchDetails(batch.id)}>
                        <Eye size={14} /> View
                      </button>
                      {batch.can_edit && batch.status !== 'voided' && (
                        <button className="btn btn-sm btn-outline-danger" onClick={() => handleVoidBatch(batch.id)}>
                          <Ban size={14} /> Void
                        </button>
                      )}
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
              <p>Total Cost: <strong>ETB {Number(selectedBatch.total_cost || 0).toFixed(2)}</strong></p>
              <hr />
              <h4>Items</h4>
              <div className="table-responsive">
                <table className="table">
                  <thead>
                    <tr><th>Product</th><th>Qty</th><th>Source</th><th>Unit Cost</th><th>Line Cost</th></tr>
                  </thead>
                  <tbody>
                    {editingItems.map((item, idx) => (
                      <tr key={item.id || idx}>
                        <td>{item.product_name}</td>
                        <td>
                          {selectedBatch.can_edit && selectedBatch.status !== 'voided' ? (
                            <input className="form-control" type="number" min="1" value={item.quantity} onChange={(e) => {
                              const next = [...editingItems];
                              next[idx] = { ...next[idx], quantity: Number(e.target.value) || 1 };
                              setEditingItems(next);
                            }} />
                          ) : item.quantity}
                        </td>
                        <td>{item.source}</td>
                        <td>ETB {Number(item.unit_cost || 0).toFixed(2)}</td>
                        <td>ETB {(Number(item.unit_cost || 0) * Number(item.quantity || 0)).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            {selectedBatch.can_edit && selectedBatch.status !== 'voided' && (
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setSelectedBatch(null)}>Close</button>
                <button className="btn btn-primary" onClick={handleSaveEdit}><Edit size={14} /> Save Changes</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

import { useEffect, useState, useCallback } from 'react';
import api, { getErrorMessage } from '../../api/axios';
import { useBranch } from '../../context/BranchContext';
import { Package, Clock, User, Eye, Edit, Ban, RefreshCw, Wifi, WifiOff, CheckCircle, XCircle } from 'lucide-react';
import { formatAddisDateTime } from '../../utils/time';
import './Batches.css';
import { useToast } from '../../context/ToastContext';
import { useConfirm } from '../../context/ConfirmContext';

const BATCH_EDIT_WINDOW_MINUTES = 20;
const BATCH_CACHE_KEY_PREFIX = 'manager_batches_cache';

export default function ManagerBatches() {
  const { selectedLocationId } = useBranch();
  const [batches, setBatches] = useState([]);
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [editingItems, setEditingItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedDay, setSelectedDay] = useState('');
  const [tick, setTick] = useState(Date.now());
  const [summaryStats, setSummaryStats] = useState({ total: 0, sent: 0, voided: 0, edited: 0, offline: 0, synced: 0 });
  const toast = useToast();
  const { confirm } = useConfirm();

  const getCacheKey = useCallback(() => {
    const locationPart = selectedLocationId || 'all';
    const dayPart = selectedDay || 'all';
    return `${BATCH_CACHE_KEY_PREFIX}:${locationPart}:${dayPart}`;
  }, [selectedLocationId, selectedDay]);

  const readCachedBatches = useCallback(() => {
    try {
      const cached = localStorage.getItem(getCacheKey());
      if (!cached) return null;
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed)) {
        return { batches: parsed, summary: null };
      }
      if (Array.isArray(parsed?.batches)) {
        return { batches: parsed.batches, summary: parsed.summary || null };
      }
      return null;
    } catch {
      return null;
    }
  }, [getCacheKey]);

  useEffect(() => {
    const timer = setInterval(() => setTick(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);

  const getMinutesRemaining = useCallback((batch) => {
    if (!batch) return 0;
    const serverAgeMinutes = Number(batch.age_minutes);
    if (Number.isFinite(serverAgeMinutes)) {
      const elapsedSinceFetch = Math.max(0, (tick - Number(batch.fetched_at_ms || tick)) / 60000);
      return Math.max(0, Math.ceil(BATCH_EDIT_WINDOW_MINUTES - serverAgeMinutes - elapsedSinceFetch));
    }
    const createdAtValue = batch.created_at || batch.batch_date;
    const createdAt = createdAtValue ? new Date(createdAtValue) : null;
    if (!createdAt || Number.isNaN(createdAt.getTime())) return batch.can_edit ? BATCH_EDIT_WINDOW_MINUTES : 0;
    const elapsedMinutes = (tick - createdAt.getTime()) / 60000;
    return Math.max(0, Math.ceil(BATCH_EDIT_WINDOW_MINUTES - elapsedMinutes));
  }, [tick]);

  const isBatchEditable = useCallback((batch) => {
    if (!batch || batch.status === 'voided') return false;
    if (Number.isFinite(Number(batch.age_minutes))) {
      return getMinutesRemaining(batch) > 0;
    }
    return Boolean(batch.can_edit);
  }, [getMinutesRemaining]);

  const fetchBatches = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    try {
      const response = await api.get('/inventory/batches', {
        params: {
          limit: 100,
          ...(selectedDay ? { start_date: selectedDay, end_date: selectedDay } : {}),
        },
      });
      const payload = response.data;
      const sourceRows = Array.isArray(payload) ? payload : (payload?.batches || []);
      const normalized = sourceRows
        .map((batch) => ({
          ...batch,
          is_offline: Boolean(batch.is_offline || batch.was_synced),
          fetched_at_ms: Date.now(),
        }))
        .sort((a, b) => {
          const aTime = new Date(a.created_at || a.batch_date || 0).getTime() || 0;
          const bTime = new Date(b.created_at || b.batch_date || 0).getTime() || 0;
          const timeDiff = bTime - aTime;
          if (timeDiff !== 0) return timeDiff;
          return Number(b.id || 0) - Number(a.id || 0);
        });
      const summary = Array.isArray(payload)
        ? null
        : (payload?.summary || null);
      setBatches(normalized);
      setSummaryStats({
        total: Number(summary?.total ?? normalized.length),
        sent: Number(summary?.sent ?? normalized.filter((b) => b.status === 'sent').length),
        voided: Number(summary?.voided ?? normalized.filter((b) => b.status === 'voided').length),
        edited: Number(summary?.edited ?? normalized.filter((b) => b.status === 'edited').length),
        offline: Number(summary?.offline ?? normalized.filter((b) => b.is_offline).length),
        synced: Number(summary?.synced ?? normalized.filter((b) => b.was_synced).length),
      });
      localStorage.setItem(getCacheKey(), JSON.stringify({ batches: normalized, summary }));
    } catch (err) {
      const cached = readCachedBatches();
      if (cached && (!navigator.onLine || !err?.response)) {
        const hydrated = cached.batches.map((batch) => ({
          ...batch,
          fetched_at_ms: Date.now(),
        }));
        setBatches(hydrated);
        const cachedSummary = cached.summary;
        setSummaryStats({
          total: Number(cachedSummary?.total ?? hydrated.length),
          sent: Number(cachedSummary?.sent ?? hydrated.filter((b) => b.status === 'sent').length),
          voided: Number(cachedSummary?.voided ?? hydrated.filter((b) => b.status === 'voided').length),
          edited: Number(cachedSummary?.edited ?? hydrated.filter((b) => b.status === 'edited').length),
          offline: Number(cachedSummary?.offline ?? hydrated.filter((b) => b.is_offline).length),
          synced: Number(cachedSummary?.synced ?? hydrated.filter((b) => b.was_synced).length),
        });
        toast.info('Offline: loaded cached batch history.');
      } else {
        toast.error(getErrorMessage(err, 'Failed to fetch batches.'));
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedDay, getCacheKey, readCachedBatches]);

  useEffect(() => {
    fetchBatches();
    const interval = setInterval(() => fetchBatches(true), 30000);
    return () => clearInterval(interval);
  }, [selectedLocationId, fetchBatches]);

  const fetchBatchDetails = async (batchId) => {
    try {
      const response = await api.get(`/inventory/batches/${batchId}`);
      setSelectedBatch({ ...response.data, is_offline: Boolean(response.data?.is_offline || response.data?.was_synced), fetched_at_ms: Date.now() });
      setEditingItems(response.data.items?.map((item) => ({ ...item })) || []);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to fetch batch details.'));
    }
  };

  const handleVoidBatch = async (batchId) => {
    const ok = await confirm({
      title: `Void Batch #${batchId}?`,
      message: 'This will remove items from inventory and cannot be undone.',
      confirmText: 'Void Batch',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await api.post(`/inventory/batches/${batchId}/void`);
      toast.success(`Batch #${batchId} was voided.`);
      setSelectedBatch(null);
      fetchBatches();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to void batch.'));
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
      toast.success(`Batch #${selectedBatch.id} updated.`);
      await fetchBatchDetails(selectedBatch.id);
      await fetchBatches();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to update batch.'));
    }
  };

  const stats = summaryStats;

  const getStatusBadge = (status) => {
    const statusMap = {
      sent: { class: 'badge-success', label: 'Sent' },
      pending: { class: 'badge-warning', label: 'Pending' },
      edited: { class: 'badge-info', label: 'Edited' },
      voided: { class: 'badge-danger', label: 'Voided' },
      received: { class: 'badge-primary', label: 'Received' },
    };
    const s = statusMap[status] || { class: 'badge-secondary', label: status };
    return <span className={`badge ${s.class}`}>{s.label}</span>;
  };

  if (loading) {
    return <div className="loading-container"><div className="spinner"></div></div>;
  }

  return (
    <div className="inventory-page">
      <div className="page-header">
        <div className="d-flex justify-content-between align-items-center flex-wrap gap-3">
          <h2>Batch History</h2>
          <button 
            className="btn btn-outline-primary" 
            onClick={() => fetchBatches(true)}
            disabled={refreshing}
          >
            <RefreshCw size={16} className={refreshing ? 'spin' : ''} /> 
            {refreshing ? ' Refreshing...' : ' Refresh'}
          </button>
        </div>
      </div>

      <div className="card mb-4">
        <div className="card-body d-flex align-items-end gap-3 flex-wrap">
          <div>
            <label className="form-label">Filter by Day</label>
            <input
              type="date"
              className="form-control"
              value={selectedDay}
              onChange={(e) => setSelectedDay(e.target.value)}
            />
          </div>
          <button className="btn btn-outline-secondary" onClick={() => setSelectedDay('')}>Clear Filter</button>
        </div>
      </div>

      <div className="stats-grid mb-4">
        <div className="stat-card card bg-light">
          <div className="stat-icon bg-primary text-white"><Package size={24} /></div>
          <div className="stat-content"><h3>{stats.total}</h3><p>Total Batches</p></div>
        </div>
        <div className="stat-card card bg-light">
          <div className="stat-icon bg-success text-white"><CheckCircle size={24} /></div>
          <div className="stat-content"><h3>{stats.sent}</h3><p>Sent</p></div>
        </div>
        <div className="stat-card card bg-light">
          <div className="stat-icon bg-danger text-white"><XCircle size={24} /></div>
          <div className="stat-content"><h3>{stats.voided}</h3><p>Voided</p></div>
        </div>
        <div className="stat-card card bg-light">
          <div className="stat-icon bg-warning text-white"><WifiOff size={24} /></div>
          <div className="stat-content"><h3>{stats.offline}</h3><p>Offline Sync</p></div>
        </div>
      </div>

      <div className="card modern-batch-card">
        <div className="card-body">
          {batches.length === 0 ? (
            <div className="empty-state">
              <Package size={48} className="text-muted" />
              <h4>No batches found</h4>
              <p>Sent batches will appear here.</p>
            </div>
          ) : (
            <div className="table-responsive">
              <table className="table table-hover modern-batch-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Date & Time</th>
                    <th>Status</th>
                    <th>Items</th>
                    <th>Total Cost</th>
                    <th>Created By</th>
                    <th>Sync Info</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {batches.map((batch) => (
                    <tr key={batch.id} className={batch.status === 'voided' ? 'table-disabled' : ''}>
                      <td><strong>#{batch.id}</strong></td>
                      <td>
                        <div>{new Date(batch.created_at).toLocaleDateString()}</div>
                        <small className="text-muted">{formatAddisDateTime(batch.created_at || batch.batch_date)}</small>
                      </td>
                      <td>{getStatusBadge(batch.status)}</td>
                      <td><span className="badge bg-secondary">{batch.items_count || 0} items</span></td>
                      <td><strong>ETB {Number(batch.total_cost || 0).toFixed(2)}</strong></td>
                      <td>
                        <div className="d-flex align-items-center gap-2">
                          <User size={14} className="text-muted" />
                          {batch.display_creator_name || batch.created_by_name}
                        </div>
                        {batch.was_synced && batch.synced_by_name && (
                          <small className="text-info d-block" style={{ fontSize: '0.7rem' }}>
                            Synced via: {batch.synced_by_name}
                          </small>
                        )}
                      </td>
                      <td>
                        {batch.is_offline ? (
                          <div className="d-flex align-items-center gap-1">
                            <WifiOff size={14} className="text-warning" />
                            <span className="badge bg-warning text-dark">Offline</span>
                          </div>
                        ) : (
                          <div className="d-flex align-items-center gap-1">
                            <Wifi size={14} className="text-success" />
                            <span className="badge bg-success">Online</span>
                          </div>
                        )}
                      </td>
                      <td>
                        <div className="d-flex gap-1">
                          {batch.status !== 'voided' && (
                            <span className={`badge ${isBatchEditable(batch) ? 'bg-warning text-dark' : 'bg-secondary'}`}>
                              {isBatchEditable(batch) ? `Locks in ${getMinutesRemaining(batch)}m` : 'Locked'}
                            </span>
                          )}
                          <button 
                            className="btn btn-sm btn-outline-primary" 
                            onClick={() => fetchBatchDetails(batch.id)}
                            title="View Details"
                          >
                            <Eye size={14} />
                          </button>
                          <button 
                            className="btn btn-sm btn-outline-danger" 
                            onClick={() => handleVoidBatch(batch.id)}
                            title={isBatchEditable(batch) ? 'Void Batch (within 20 min)' : 'Batch locked after 20 minutes'}
                            disabled={!isBatchEditable(batch)}
                          >
                            <Ban size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {selectedBatch && (
        <div className="modal-overlay" onClick={() => setSelectedBatch(null)}>
          <div className="modal-content modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>
                <Package size={20} className="me-2" />
                Batch #{selectedBatch.id}
              </h3>
              <button className="close-btn" onClick={() => setSelectedBatch(null)}>×</button>
            </div>
            <div className="modal-body">
              <div className="row mb-4">
                <div className="col-md-6">
                  <div className="detail-item">
                    <Clock size={14} className="me-2 text-muted" />
                    <span className="text-muted">Created:</span>
                    <strong>{formatAddisDateTime(selectedBatch.created_at || selectedBatch.batch_date)}</strong>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="detail-item">
                    <User size={14} className="me-2 text-muted" />
                    <span className="text-muted">By:</span>
                    <strong>{selectedBatch.display_creator_name || selectedBatch.created_by_name}</strong>
                  </div>
                </div>
              </div>
              
              <div className="row mb-4">
                <div className="col-md-4">
                  <div className="stat-box">
                    <div className="stat-box-label">Status</div>
                    <div className="stat-box-value">{getStatusBadge(selectedBatch.status)}</div>
                  </div>
                </div>
                <div className="col-md-4">
                  <div className="stat-box">
                    <div className="stat-box-label">Total Items</div>
                    <div className="stat-box-value">{selectedBatch.items?.length || 0}</div>
                  </div>
                </div>
                <div className="col-md-4">
                  <div className="stat-box">
                    <div className="stat-box-label">Total Cost</div>
                    <div className="stat-box-value">ETB {Number(selectedBatch.total_cost || 0).toFixed(2)}</div>
                  </div>
                </div>
              </div>

              <div className={`alert ${isBatchEditable(selectedBatch) ? 'alert-warning' : 'alert-secondary'} mb-4`}>
                {isBatchEditable(selectedBatch)
                  ? `Edit/Void available for ${getMinutesRemaining(selectedBatch)} more minute(s).`
                  : 'This batch is locked after 20 minutes and can no longer be edited or voided.'}
              </div>

              {selectedBatch.was_synced && selectedBatch.synced_by_name && (
                <div className="alert alert-info mb-4">
                  <WifiOff size={16} className="me-2" />
                  This batch was synced offline by <strong>{selectedBatch.synced_by_name}</strong>
                </div>
              )}

              <h5 className="mb-3">Items in Batch</h5>
              <div className="table-responsive">
                <table className="table table-sm table-bordered">
                  <thead className="table-light">
                    <tr>
                      <th>Product</th>
                      <th>Quantity</th>
                      <th>Source</th>
                      <th>Unit Cost</th>
                      <th>Line Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {editingItems.map((item, idx) => (
                      <tr key={item.id || idx}>
                        <td>{item.product_name}</td>
                        <td style={{ width: '100px' }}>
                          {isBatchEditable(selectedBatch) ? (
                            <input 
                              className="form-control form-control-sm" 
                              type="number" 
                              min="1" 
                              value={item.quantity} 
                              onChange={(e) => {
                                const next = [...editingItems];
                                next[idx] = { ...next[idx], quantity: Number(e.target.value) || 1 };
                                setEditingItems(next);
                              }} 
                            />
                          ) : (
                            <strong>{item.quantity}</strong>
                          )}
                        </td>
                        <td>
                          <span className={`badge ${item.source === 'baked' ? 'bg-success' : 'bg-secondary'}`}>
                            {item.source}
                          </span>
                        </td>
                        <td>ETB {Number(item.unit_cost || 0).toFixed(2)}</td>
                        <td><strong>ETB {(Number(item.unit_cost || 0) * Number(item.quantity || 0)).toFixed(2)}</strong></td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <th colSpan="4" className="text-end">Total Cost:</th>
                      <th>ETB {Number(selectedBatch.total_cost || 0).toFixed(2)}</th>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setSelectedBatch(null)}>Close</button>
              <button className="btn btn-primary" onClick={handleSaveEdit} disabled={!isBatchEditable(selectedBatch)}>
                <Edit size={14} className="me-1" /> Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

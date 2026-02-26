import { useEffect, useMemo, useState } from 'react';
import api, { getErrorMessage } from '../../api/axios';
import { AlertTriangle } from 'lucide-react';

export default function HistoryLifecycle() {
  const [data, setData] = useState(null);
  const [settingsForm, setSettingsForm] = useState({ enabled: false, retention_months: 6, cold_storage_after_months: 24 });
  const [confirmationPhrase, setConfirmationPhrase] = useState('');
  const [message, setMessage] = useState(null);
  const [loading, setLoading] = useState(false);

  const fetchData = async () => {
    try {
      const response = await api.get('/archive/settings');
      setData(response.data);
      setSettingsForm({
        enabled: Boolean(response.data?.settings?.enabled),
        retention_months: Number(response.data?.settings?.retention_months || 6),
        cold_storage_after_months: Number(response.data?.settings?.cold_storage_after_months || 24),
      });
    } catch (err) {
      setMessage({ type: 'danger', text: getErrorMessage(err, 'Failed to load archive settings') });
    }
  };

  useEffect(() => { fetchData(); }, []);

  const saveSettings = async () => {
    setLoading(true);
    try {
      await api.put('/archive/settings', settingsForm);
      setMessage({ type: 'success', text: 'Archive settings updated.' });
      fetchData();
    } catch (err) {
      setMessage({ type: 'danger', text: getErrorMessage(err, 'Failed to save settings') });
    } finally {
      setLoading(false);
    }
  };

  const runArchive = async () => {
    setLoading(true);
    try {
      await api.post('/archive/run', { confirmation_phrase: confirmationPhrase });
      setMessage({ type: 'success', text: 'Archive job started successfully.' });
      setConfirmationPhrase('');
      fetchData();
    } catch (err) {
      setMessage({ type: 'danger', text: getErrorMessage(err, 'Archive run failed') });
    } finally {
      setLoading(false);
    }
  };

  const expectedPhrase = useMemo(() => data?.confirmation_phrase || 'I CONFIRM TO ARCHIVE THE LAST 6 MONTH HISTORY', [data]);

  return (
    <div>
      <div className="page-header"><h2>History Lifecycle</h2></div>
      {message && <div className={`alert alert-${message.type}`}>{message.text}</div>}

      <div className="card mb-4">
        <div className="card-header"><h4>Auto-Archive Configuration</h4></div>
        <div className="card-body" style={{ display: 'grid', gap: '0.75rem', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))' }}>
          <label className="label">
            <input type="checkbox" checked={settingsForm.enabled} onChange={(e) => setSettingsForm({ ...settingsForm, enabled: e.target.checked })} /> Enable archive every 6 months policy
          </label>
          <div>
            <label className="label">Retention months in active DB</label>
            <input className="input" type="number" min="1" max="24" value={settingsForm.retention_months} onChange={(e) => setSettingsForm({ ...settingsForm, retention_months: Number(e.target.value) })} />
          </div>
          <div>
            <label className="label">Cold storage threshold (months)</label>
            <input className="input" type="number" min="6" max="60" value={settingsForm.cold_storage_after_months} onChange={(e) => setSettingsForm({ ...settingsForm, cold_storage_after_months: Number(e.target.value) })} />
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button className="btn btn-primary" disabled={loading} onClick={saveSettings}>Save Settings</button>
          </div>
        </div>
      </div>

      <div className="card mb-4">
        <div className="card-header"><h4>Archived Data Counts</h4></div>
        <div className="card-body" style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <span className="badge badge-primary">Sales: {data?.archive_counts?.sales || 0}</span>
          <span className="badge badge-primary">Inventory Logs: {data?.archive_counts?.inventory_movements || 0}</span>
          <span className="badge badge-primary">Activity Logs: {data?.archive_counts?.activity_log || 0}</span>
          <span className="badge badge-primary">Expenses: {data?.archive_counts?.expenses || 0}</span>
          <span className="badge badge-primary">Staff Payments: {data?.archive_counts?.staff_payments || 0}</span>
        </div>
      </div>

      <div className="card" style={{ borderColor: 'rgba(239,68,68,0.4)' }}>
        <div className="card-header" style={{ background: 'rgba(239,68,68,0.08)' }}>
          <h4 style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', color: 'var(--danger)' }}><AlertTriangle size={18}/> Danger Zone</h4>
        </div>
        <div className="card-body">
          <p>To run archive now, type the exact confirmation phrase:</p>
          <code>{expectedPhrase}</code>
          <input className="input" style={{ marginTop: '0.75rem' }} value={confirmationPhrase} onChange={(e) => setConfirmationPhrase(e.target.value)} placeholder="Type confirmation phrase" />
          <button className="btn btn-danger" style={{ marginTop: '0.75rem' }} disabled={confirmationPhrase !== expectedPhrase || loading} onClick={runArchive}>
            Confirm and archive last 6 month history
          </button>
        </div>
      </div>
    </div>
  );
}

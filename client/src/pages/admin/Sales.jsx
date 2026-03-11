import { useState, useEffect, useMemo, useCallback } from 'react';
import api from '../../api/axios';
import { useBranch } from '../../context/BranchContext';
import { Eye, DollarSign, CreditCard, Calendar, Search, RotateCcw, Filter, ShoppingBag, Package } from 'lucide-react';
import { formatAddisDateTime } from '../../utils/time';
import { useLanguage } from '../../context/LanguageContext';
import { useToast } from '../../context/ToastContext';
import { Card, CardHeader, CardBody } from '../../components/ui/Card';
import { Table, THead, TBody, TR, TH, TD } from '../../components/ui/Table';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { Skeleton } from '../../components/ui/Skeleton';

const initialFilters = {
  startDate: '',
  endDate: '',
  paymentMethod: '',
  status: '',
  searchTerm: ''
};

export default function SalesPage() {
  const { selectedLocationId } = useBranch();
  const { t } = useLanguage();
  const toast = useToast();

  const [activeView, setActiveView] = useState('sales');
  const [sales, setSales] = useState([]);
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedSale, setSelectedSale] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [filters, setFilters] = useState(initialFilters);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [salesRes, batchRes] = await Promise.all([
        api.get('/sales'),
        api.get('/inventory/batches', { params: { limit: 200 } })
      ]);
      setSales(salesRes.data || []);
      setBatches(batchRes.data?.batches || []);
    } catch (err) {
      toast.error('Failed to fetch sales/batches');
      setSales([]);
      setBatches([]);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData, selectedLocationId]);

  const openSaleDetails = async (sale) => {
    setDetailLoading(true);
    try {
      const response = await api.get(`/sales/${sale.id}`);
      setSelectedSale(response.data);
    } catch {
      setSelectedSale(sale);
    } finally {
      setDetailLoading(false);
    }
  };

  const filteredSales = useMemo(() => sales.filter((sale) => {
    const saleDate = new Date(sale.sale_date);
    if (filters.startDate && saleDate < new Date(filters.startDate)) return false;
    if (filters.endDate && saleDate > new Date(`${filters.endDate}T23:59:59`)) return false;
    if (filters.paymentMethod && sale.payment_method !== filters.paymentMethod) return false;
    if (filters.status && sale.status !== filters.status) return false;

    if (filters.searchTerm) {
      const term = filters.searchTerm.toLowerCase();
      const receipt = String(sale.receipt_number || '').toLowerCase();
      const cashier = String(sale.cashier_name || sale.cashier_id || '').toLowerCase();
      const amount = String(Number(sale.total_amount || 0).toFixed(2));
      if (!receipt.includes(term) && !cashier.includes(term) && !amount.includes(term)) return false;
    }

    return true;
  }), [sales, filters]);

  const filteredBatches = useMemo(() => batches.filter((batch) => {
    const createdAt = new Date(batch.created_at);
    if (filters.startDate && createdAt < new Date(filters.startDate)) return false;
    if (filters.endDate && createdAt > new Date(`${filters.endDate}T23:59:59`)) return false;
    if (filters.status && batch.status !== filters.status) return false;
    if (filters.searchTerm) {
      const term = filters.searchTerm.toLowerCase();
      const createdBy = String(batch.display_creator_name || batch.created_by_name || '').toLowerCase();
      const idText = String(batch.id || '').toLowerCase();
      if (!createdBy.includes(term) && !idText.includes(term)) return false;
    }
    return true;
  }), [batches, filters]);

  const totalAmount = filteredSales.reduce((sum, sale) => sum + Number(sale.total_amount || 0), 0);

  if (loading) return (
    <div className="animate-fade-in">
       <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2rem' }}>
         <Skeleton width="240px" height="2.5rem" />
         <Skeleton width="200px" height="2.5rem" />
       </div>
       <Skeleton height="120px" style={{ marginBottom: '2rem' }} />
       <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem', marginBottom: '2rem' }}>
          {[1, 2, 3].map(i => <Skeleton key={i} height="100px" />)}
       </div>
       <Skeleton height="400px" />
    </div>
  );

  return (
    <div className="sales-page animate-fade-in">
      <div className="page-header" style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.75rem' }}>{activeView === 'sales' ? 'Sales Records' : 'Batch Performance'}</h1>
        <div style={{ display: 'flex', background: 'var(--surface-bg)', padding: '0.25rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--accent-border)' }}>
          <button
            onClick={() => setActiveView('sales')}
            style={{
              padding: '0.5rem 1.25rem',
              borderRadius: 'calc(var(--radius-sm) - 2px)',
              border: 'none',
              background: activeView === 'sales' ? 'var(--button-mid)' : 'transparent',
              color: activeView === 'sales' ? '#fff' : 'var(--text-secondary)',
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            Sales
          </button>
          <button
            onClick={() => setActiveView('batches')}
            style={{
              padding: '0.5rem 1.25rem',
              borderRadius: 'calc(var(--radius-sm) - 2px)',
              border: 'none',
              background: activeView === 'batches' ? 'var(--button-mid)' : 'transparent',
              color: activeView === 'batches' ? '#fff' : 'var(--text-secondary)',
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            Batches
          </button>
        </div>
      </div>

      <Card style={{ marginBottom: '2rem' }}>
        <CardBody>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
              <Filter size={18} /> Filters
            </div>
            <Button variant="secondary" size="sm" onClick={() => setFilters(initialFilters)}>
              <RotateCcw size={14} style={{ marginRight: '0.375rem' }} /> Clear
            </Button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
            <Input type="date" label="Start Date" value={filters.startDate} onChange={(e) => setFilters({ ...filters, startDate: e.target.value })} />
            <Input type="date" label="End Date" value={filters.endDate} onChange={(e) => setFilters({ ...filters, endDate: e.target.value })} />
            {activeView === 'sales' && (
              <Select
                label="Payment Method"
                value={filters.paymentMethod}
                onChange={(e) => setFilters({ ...filters, paymentMethod: e.target.value })}
                options={[
                  { label: 'All Methods', value: '' },
                  { label: 'Cash', value: 'cash' },
                  { label: 'Card', value: 'card' },
                  { label: 'Mobile Banking', value: 'mobile' },
                  { label: 'Telebirr', value: 'telebirr' }
                ]}
              />
            )}
            <Select
              label="Status"
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value })}
              options={[
                { label: 'All Statuses', value: '' },
                { label: 'Completed', value: 'completed' },
                { label: 'Voided', value: 'voided' },
                { label: 'Sent', value: 'sent' },
                { label: 'Edited', value: 'edited' }
              ]}
            />
            <Input
              label="Search"
              placeholder={activeView === 'sales' ? 'Receipt, cashier...' : 'Batch #, creator...'}
              value={filters.searchTerm}
              onChange={(e) => setFilters({ ...filters, searchTerm: e.target.value })}
              icon={<Search size={16} />}
            />
          </div>
        </CardBody>
      </Card>

      {activeView === 'sales' ? (
        <>
          <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
            <StatCard label="Total Revenue" value={`ETB ${totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}`} icon={<DollarSign size={24} />} variant="success" />
            <StatCard label="Transactions" value={filteredSales.length} icon={<CreditCard size={24} />} />
            <StatCard label="Avg. Order" value={`ETB ${filteredSales.length > 0 ? (totalAmount / filteredSales.length).toFixed(2) : '0.00'}`} icon={<Calendar size={24} />} variant="info" />
          </div>
          <Card>
            <CardBody style={{ padding: 0 }}>
              <Table>
                <THead>
                  <TR>
                    <TH>Receipt #</TH>
                    <TH>Date & Time</TH>
                    <TH>Amount</TH>
                    <TH>Payment</TH>
                    <TH>Status</TH>
                    <TH>Cashier</TH>
                    <TH style={{ textAlign: 'right' }}>Actions</TH>
                  </TR>
                </THead>
                <TBody>
                  {filteredSales.map((sale) => (
                    <TR key={sale.id}>
                      <TD style={{ fontWeight: 700, fontSize: '0.875rem' }}>{sale.receipt_number}</TD>
                      <TD style={{ fontSize: '0.8125rem' }}>{formatAddisDateTime(sale.sale_date, { hour12: true })}</TD>
                      <TD style={{ fontWeight: 800 }}>ETB {Number(sale.total_amount).toFixed(2)}</TD>
                      <TD>
                        <Badge variant={sale.payment_method === 'cash' ? 'success' : 'info'}>
                          {sale.payment_method}
                        </Badge>
                      </TD>
                      <TD>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                           <Badge variant={sale.is_offline ? 'warning' : 'success'}>
                             {sale.is_offline ? 'Offline' : 'Online'}
                           </Badge>
                           {sale.status === 'voided' && (
                             <span style={{ fontSize: '0.6875rem', color: 'var(--text-error)', fontWeight: 700 }}>VOIDED</span>
                           )}
                        </div>
                      </TD>
                      <TD style={{ fontSize: '0.875rem' }}>{sale.cashier_name || sale.cashier_id}</TD>
                      <TD style={{ textAlign: 'right' }}>
                        <Button variant="secondary" size="sm" onClick={() => openSaleDetails(sale)}>
                          <Eye size={14} style={{ marginRight: '0.25rem' }} /> View
                        </Button>
                      </TD>
                    </TR>
                  ))}
                  {filteredSales.length === 0 && (
                    <TR><TD colSpan={7} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>No sales records found</TD></TR>
                  )}
                </TBody>
              </Table>
            </CardBody>
          </Card>
        </>
      ) : (
        <Card>
          <CardBody style={{ padding: 0 }}>
            <Table>
              <THead>
                <TR>
                  <TH>Batch #</TH>
                  <TH>Created At</TH>
                  <TH>Created By</TH>
                  <TH>Status</TH>
                  <TH>Items</TH>
                  <TH>Total Cost</TH>
                  <TH>Sync</TH>
                </TR>
              </THead>
              <TBody>
                {filteredBatches.map((batch) => (
                  <TR key={batch.id}>
                    <TD style={{ fontWeight: 700 }}>#{batch.id}</TD>
                    <TD style={{ fontSize: '0.8125rem' }}>{formatAddisDateTime(batch.created_at, { hour12: true })}</TD>
                    <TD>{batch.display_creator_name || batch.created_by_name}</TD>
                    <TD>
                      <Badge variant={batch.status === 'voided' ? 'danger' : batch.status === 'edited' ? 'warning' : 'success'}>
                        {batch.status || 'sent'}
                      </Badge>
                    </TD>
                    <TD>{Number(batch.items_count || 0)}</TD>
                    <TD style={{ fontWeight: 700 }}>ETB {Number(batch.total_cost || 0).toFixed(2)}</TD>
                    <TD>
                      <Badge variant={batch.was_synced ? 'success' : 'info'}>
                        {batch.was_synced ? 'Synced' : batch.is_offline ? 'Offline' : 'Online'}
                      </Badge>
                    </TD>
                  </TR>
                ))}
                {filteredBatches.length === 0 && (
                  <TR><TD colSpan={7} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>No batch records found</TD></TR>
                )}
              </TBody>
            </Table>
          </CardBody>
        </Card>
      )}

      <Modal
        isOpen={!!selectedSale}
        onClose={() => setSelectedSale(null)}
        title={`Sale Details - ${selectedSale?.receipt_number}`}
        size="lg"
      >
        {selectedSale && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
               <div style={{ background: 'var(--surface-bg)', padding: '1.25rem', borderRadius: 'var(--radius)', border: '1px solid var(--accent-border)' }}>
                 <h4 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><DollarSign size={18} /> Transaction</h4>
                 <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text-muted)' }}>Date:</span> <strong>{formatAddisDateTime(selectedSale.sale_date, { hour12: true })}</strong></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text-muted)' }}>Amount:</span> <strong style={{ fontSize: '1.125rem' }}>ETB {Number(selectedSale.total_amount).toFixed(2)}</strong></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text-muted)' }}>Method:</span> <Badge variant="info">{selectedSale.payment_method}</Badge></div>
                 </div>
               </div>
               <div style={{ background: 'var(--surface-bg)', padding: '1.25rem', borderRadius: 'var(--radius)', border: '1px solid var(--accent-border)' }}>
                 <h4 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Package size={18} /> Staff & Status</h4>
                 <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text-muted)' }}>Cashier:</span> <strong>{selectedSale.cashier_name || selectedSale.cashier_id}</strong></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text-muted)' }}>Sync:</span> <Badge variant={selectedSale.is_offline ? 'warning' : 'success'}>{selectedSale.is_offline ? 'Offline' : 'Online'}</Badge></div>
                    {selectedSale.status === 'voided' && (
                      <div style={{ padding: '0.75rem', background: 'var(--error-bg)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--error-border)', marginTop: '0.25rem' }}>
                         <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-error)', marginBottom: '0.25rem' }}>VOIDED AT {formatAddisDateTime(selectedSale.voided_at)}</div>
                         <div style={{ fontSize: '0.8125rem' }}>{selectedSale.void_reason || 'No reason provided'}</div>
                      </div>
                    )}
                 </div>
               </div>
            </div>

            <div>
              <h4 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><ShoppingBag size={18} /> Items Sold</h4>
              <Table>
                <THead>
                  <TR>
                    <TH>Product</TH>
                    <TH>Qty</TH>
                    <TH>Unit Price</TH>
                    <TH style={{ textAlign: 'right' }}>Subtotal</TH>
                  </TR>
                </THead>
                <TBody>
                  {(selectedSale.items || []).map((item, i) => (
                    <TR key={i}>
                      <TD style={{ fontWeight: 600 }}>{item.product_name || item.product_id}</TD>
                      <TD>{item.quantity}</TD>
                      <TD>ETB {Number(item.unit_price || 0).toFixed(2)}</TD>
                      <TD style={{ textAlign: 'right', fontWeight: 700 }}>ETB {Number(item.subtotal || 0).toFixed(2)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button variant="secondary" onClick={() => setSelectedSale(null)}>Close</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function StatCard({ label, value, icon, variant = 'primary' }) {
  const colors = {
    primary: { bg: 'rgba(244, 162, 97, 0.1)', color: 'var(--button-end)' },
    success: { bg: 'var(--success-bg)', color: 'var(--success-text)' },
    info: { bg: 'rgba(37, 99, 235, 0.1)', color: '#2563eb' },
  };
  const current = colors[variant] || colors.primary;

  return (
    <Card>
      <CardBody style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: current.bg, color: current.color, display: 'grid', placeItems: 'center' }}>
          {icon}
        </div>
        <div>
          <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{label}</div>
          <div style={{ fontSize: '1.25rem', fontWeight: 800 }}>{value}</div>
        </div>
      </CardBody>
    </Card>
  );
}

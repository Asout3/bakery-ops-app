import { useState, useEffect, useCallback, useMemo } from 'react';
import api, { getErrorMessage } from '../../api/axios';
import { useBranch } from '../../context/BranchContext';
import { useAuth } from '../../context/AuthContext';
import { Plus, Edit, Trash2, TrendingDown, DollarSign, Calendar, Clock, Eye, RotateCcw, Search, Filter } from 'lucide-react';
import { enqueueOperation } from '../../utils/offlineQueue';
import { useLanguage } from '../../context/LanguageContext';
import { useToast } from '../../context/ToastContext';
import { useConfirm } from '../../context/ConfirmContext';
import { Card, CardHeader, CardBody } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { Table, THead, TBody, TR, TH, TD } from '../../components/ui/Table';
import { Textarea } from '../../components/ui/Textarea';
import { Skeleton } from '../../components/ui/Skeleton';
import { Alert } from '../../components/ui/Alert';

const EXPENSE_EDIT_WINDOW_MINUTES = 20;

export default function ExpensesPage() {
  const { selectedLocationId } = useBranch();
  const { user } = useAuth();
  const { t } = useLanguage();
  const toast = useToast();
  const { confirm } = useConfirm();

  const isAdmin = user?.role === 'admin';
  const [expenses, setExpenses] = useState([]);
  const [categories, setCategories] = useState([]);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingExpense, setEditingExpense] = useState(null);
  const [selectedDay, setSelectedDay] = useState('');
  const [showDescription, setShowDescription] = useState(null);
  const [formData, setFormData] = useState({
    category: '',
    description: '',
    amount: '',
    expense_date: new Date().toISOString().split('T')[0],
  });

  const fetchCategories = useCallback(async () => {
    try {
      const response = await api.get('/expenses/categories');
      setCategories(response.data || []);
      if (!formData.category && response.data?.length) {
        setFormData((prev) => ({ ...prev, category: response.data[0].name }));
      }
    } catch {
      setCategories([]);
    }
  }, [formData.category]);

  const fetchExpenses = useCallback(async () => {
    setLoading(true);
    try {
      const params = selectedDay ? { start_date: selectedDay, end_date: selectedDay } : {};
      const response = await api.get('/expenses', { params });
      setExpenses(response.data || []);
    } catch (err) {
      toast.error('Failed to fetch expenses');
    } finally {
      setLoading(false);
    }
  }, [selectedDay, toast]);

  useEffect(() => {
    fetchExpenses();
    fetchCategories();
  }, [fetchExpenses, fetchCategories, selectedLocationId]);

  const resetForm = () => {
    setShowForm(false);
    setEditingExpense(null);
    setFormData({ category: categories[0]?.name || '', description: '', amount: '', expense_date: new Date().toISOString().split('T')[0] });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingExpense) {
        await api.put(`/expenses/${editingExpense.id}`, formData);
        toast.success('Expense updated');
      } else {
        await api.post('/expenses', formData);
        toast.success('Expense created');
      }
      await fetchExpenses();
      resetForm();
    } catch (err) {
      if (!editingExpense && !err.response) {
        const idempotencyKey = `expense-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        await enqueueOperation({ url: '/expenses', method: 'post', data: formData, idempotencyKey });
        toast.warning('Offline: expense queued for sync');
        resetForm();
      } else {
        toast.error(getErrorMessage(err, 'Failed to save expense'));
      }
    }
  };

  const handleCreateCategory = async () => {
    if (!newCategoryName.trim()) return;
    try {
      const response = await api.post('/expenses/categories', { name: newCategoryName.trim() });
      setCategories((current) => [...current, response.data].sort((a, b) => a.name.localeCompare(b.name)));
      setFormData((prev) => ({ ...prev, category: response.data.name }));
      setNewCategoryName('');
      toast.success('Category created');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to create category'));
    }
  };

  const handleDeleteCategory = async (category) => {
    const isConfirmed = await confirm({
      title: 'Delete Category?',
      message: `Are you sure you want to delete category "${category.name}"?`,
      variant: 'danger'
    });
    if (!isConfirmed) return;

    try {
      await api.delete(`/expenses/categories/${category.id}`);
      const next = categories.filter((c) => Number(c.id) !== Number(category.id));
      setCategories(next);
      setFormData((prev) => ({ ...prev, category: next[0]?.name || '' }));
      toast.success('Category deleted');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to delete category'));
    }
  };

  const handleDelete = async (expense) => {
    const isConfirmed = await confirm({
      title: 'Delete Expense?',
      message: `Are you sure you want to delete this expense of ETB ${expense.amount}?`,
      variant: 'danger'
    });
    if (!isConfirmed) return;

    try {
      await api.delete(`/expenses/${expense.id}`);
      await fetchExpenses();
      toast.success('Expense deleted');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to delete expense'));
    }
  };

  const getMinutesRemaining = (expense) => {
    const createdAt = expense?.created_at ? new Date(expense.created_at) : null;
    if (!createdAt || Number.isNaN(createdAt.getTime())) return 0;
    const elapsed = (Date.now() - createdAt.getTime()) / 60000;
    return Math.max(0, Math.ceil(EXPENSE_EDIT_WINDOW_MINUTES - elapsed));
  };

  const isEditable = (expense) => isAdmin && getMinutesRemaining(expense) > 0;

  const totalExpenses = useMemo(() => expenses.reduce((sum, exp) => sum + parseFloat(exp.amount || 0), 0), [expenses]);

  if (loading) return (
    <div className="animate-fade-in">
       <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2rem' }}>
         <Skeleton width="240px" height="2.5rem" />
         <Skeleton width="160px" height="2.5rem" />
       </div>
       <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem', marginBottom: '2rem' }}>
          {[1, 2, 3].map(i => <Skeleton key={i} height="100px" />)}
       </div>
       <Skeleton height="80px" style={{ marginBottom: '2rem' }} />
       <Skeleton height="400px" />
    </div>
  );

  return (
    <div className="expenses-page animate-fade-in">
      <div className="page-header" style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.75rem' }}>{t('expenses')}</h1>
        <Button variant="primary" onClick={() => { setEditingExpense(null); setFormData({ category: categories[0]?.name || '', description: '', amount: '', expense_date: new Date().toISOString().split('T')[0] }); setShowForm(true); }}>
          <Plus size={18} /> Add Expense
        </Button>
      </div>

      <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
        <StatCard label="Total Expenses" value={`ETB ${totalExpenses.toFixed(2)}`} icon={<TrendingDown size={24} />} variant="danger" />
        <StatCard label="Total Records" value={expenses.length} icon={<DollarSign size={24} />} variant="warning" />
        <StatCard label="Avg. Expense" value={`ETB ${expenses.length > 0 ? (totalExpenses / expenses.length).toFixed(2) : '0.00'}`} icon={<Calendar size={24} />} variant="info" />
      </div>

      <Card style={{ marginBottom: '2rem' }}>
        <CardBody style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end' }}>
          <div style={{ flex: 1, maxWidth: '300px' }}>
            <Input
              type="date"
              label="Filter by Day"
              value={selectedDay}
              onChange={(e) => setSelectedDay(e.target.value)}
            />
          </div>
          <Button variant="secondary" onClick={() => setSelectedDay('')}>
             <RotateCcw size={18} style={{ marginRight: '0.375rem' }} /> Clear Filter
          </Button>
        </CardBody>
      </Card>

      <Card>
        <CardBody style={{ padding: 0 }}>
          <Table>
            <THead>
              <TR>
                <TH>Expense ID</TH>
                <TH>Date</TH>
                <TH>Category</TH>
                <TH>Description</TH>
                <TH>Amount</TH>
                <TH>Created By</TH>
                {isAdmin && <TH>Status</TH>}
                {isAdmin && <TH style={{ textAlign: 'right' }}>Actions</TH>}
              </TR>
            </THead>
            <TBody>
              {expenses.map((expense) => (
                <TR key={expense.id}>
                  <TD style={{ fontSize: '0.8125rem', fontFamily: 'monospace', fontWeight: 600 }}>
                    {expense.expense_code || `EXP-${String(expense.id).padStart(6, '0')}`}
                  </TD>
                  <TD>{new Date(expense.expense_date).toLocaleDateString()}</TD>
                  <TD><Badge variant="primary">{expense.category}</Badge></TD>
                  <TD>
                    <Button variant="outline" size="sm" onClick={() => setShowDescription(expense)}>
                      <Eye size={14} style={{ marginRight: '0.375rem' }} /> View
                    </Button>
                  </TD>
                  <TD style={{ fontWeight: 800, color: 'var(--text-error)' }}>ETB {Number(expense.amount).toFixed(2)}</TD>
                  <TD style={{ fontSize: '0.875rem' }}>{expense.created_by_name || '-'}</TD>
                  {isAdmin && (
                    <TD>
                      {isEditable(expense) ? (
                        <Badge variant="warning">
                          <Clock size={12} style={{ marginRight: '0.25rem' }} /> {getMinutesRemaining(expense)}m left
                        </Badge>
                      ) : (
                        <Badge variant="info">Locked</Badge>
                      )}
                    </TD>
                  )}
                  {isAdmin && (
                    <TD style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '0.375rem', justifyContent: 'flex-end' }}>
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={!isEditable(expense)}
                          onClick={() => {
                            setEditingExpense(expense);
                            setFormData({ category: expense.category, description: expense.description || '', amount: expense.amount, expense_date: expense.expense_date });
                            setShowForm(true);
                          }}
                        >
                          <Edit size={14} />
                        </Button>
                        <Button
                          variant="danger"
                          size="sm"
                          disabled={!isEditable(expense)}
                          onClick={() => handleDelete(expense)}
                        >
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    </TD>
                  )}
                </TR>
              ))}
              {expenses.length === 0 && (
                <TR><TD colSpan={isAdmin ? 8 : 6} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>No expenses found</TD></TR>
              )}
            </TBody>
          </Table>
        </CardBody>
      </Card>

      <Modal
        isOpen={showForm}
        onClose={resetForm}
        title={editingExpense ? 'Edit Expense' : 'Add New Expense'}
        size="md"
      >
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <Select
                label="Category *"
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                required
                options={[
                  { label: 'Select Category', value: '' },
                  ...categories.map(c => ({ label: c.name, value: c.name }))
                ]}
              />
              {!editingExpense && (
                <div style={{ padding: '1rem', background: 'var(--surface-bg)', borderRadius: 'var(--radius)', border: '1px solid var(--accent-border)' }}>
                  <label className="form-label" style={{ fontSize: '0.75rem' }}>Manage Categories</label>
                  <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
                    <Input
                      placeholder="New name..."
                      value={newCategoryName}
                      onChange={(e) => setNewCategoryName(e.target.value)}
                      style={{ minHeight: '2rem', padding: '0.25rem 0.5rem', fontSize: '0.8125rem' }}
                    />
                    <Button variant="outline" size="sm" type="button" onClick={handleCreateCategory}>Add</Button>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem' }}>
                    {categories.map((cat) => (
                      <Badge key={cat.id} variant="primary" style={{ paddingRight: '0.25rem' }}>
                        {cat.name}
                        {isAdmin && (
                          <button
                            type="button"
                            onClick={() => handleDeleteCategory(cat)}
                            style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', marginLeft: '0.25rem' }}
                          >
                            ×
                          </button>
                        )}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
               <Input
                 label="Amount (ETB) *"
                 type="number"
                 step="0.01"
                 min="0"
                 value={formData.amount}
                 onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                 required
               />
               <Input
                 label="Date *"
                 type="date"
                 value={formData.expense_date}
                 onChange={(e) => setFormData({ ...formData, expense_date: e.target.value })}
                 required
               />
            </div>
          </div>

          <Textarea
            label="Description"
            placeholder="What was this expense for?"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          />

          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
            <Button variant="secondary" onClick={resetForm} type="button">Cancel</Button>
            <Button type="submit">{editingExpense ? 'Update Expense' : 'Add Expense'}</Button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={!!showDescription}
        onClose={() => setShowDescription(null)}
        title="Expense Details"
        size="sm"
      >
        {showDescription && (
          <div>
            <div style={{ marginBottom: '1.5rem' }}>
               <div style={{ color: 'var(--text-muted)', fontSize: '0.8125rem', marginBottom: '0.25rem' }}>ID</div>
               <div style={{ fontWeight: 700, fontSize: '1rem' }}>{showDescription.expense_code || `EXP-${String(showDescription.id).padStart(6, '0')}`}</div>
            </div>
            <div style={{ marginBottom: '1.5rem' }}>
               <div style={{ color: 'var(--text-muted)', fontSize: '0.8125rem', marginBottom: '0.25rem' }}>Description</div>
               <div style={{ background: 'var(--surface-bg)', padding: '1rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--accent-border)', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                 {showDescription.description || 'No description provided.'}
               </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button variant="secondary" onClick={() => setShowDescription(null)}>Close</Button>
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
    danger: { bg: 'var(--error-bg)', color: 'var(--text-error)' },
    warning: { bg: 'rgba(255, 152, 0, 0.1)', color: '#f57c00' },
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

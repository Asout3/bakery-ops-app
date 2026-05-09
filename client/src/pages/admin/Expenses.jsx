import { useState, useEffect } from 'react';
import './Expenses.css';
import api, { getErrorMessage } from '../../api/axios';
import { useBranch } from '../../context/BranchContext';
import { useAuth } from '../../context/AuthContext';
import { Plus, Edit, Trash2, TrendingDown, DollarSign, Calendar, Clock, Eye } from 'lucide-react';
import { enqueueOperation } from '../../utils/offlineQueue';
import { useToast } from '../../context/ToastContext';

const EXPENSE_EDIT_WINDOW_MINUTES = 20;

export default function ExpensesPage() {
  const { selectedLocationId } = useBranch();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [expenses, setExpenses] = useState([]);
  const [categories, setCategories] = useState([]);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [message, setMessage] = useState(null);
  const [editingExpense, setEditingExpense] = useState(null);
  const [selectedDay, setSelectedDay] = useState('');
  const [showDescription, setShowDescription] = useState(null);
  const [isSubmittingExpense, setIsSubmittingExpense] = useState(false);
  const [isSubmittingCategory, setIsSubmittingCategory] = useState(false);
  const hasManagedCategories = categories.some((category) => category.id);
  const toast = useToast();
  const today = new Date().toISOString().split('T')[0];
  const [formData, setFormData] = useState({
    category: '',
    description: '',
    amount: '',
    expense_date: today,
  });

  useEffect(() => {
    fetchExpenses();
    fetchCategories();
  }, [selectedLocationId, selectedDay]);

  useEffect(() => {
    if (!message?.text) return;
    if (message.type === 'success') toast.success(message.text);
    else if (message.type === 'warning') toast.warning(message.text);
    else toast.error(message.text);
  }, [message, toast]);

  const fetchCategories = async () => {
    try {
      const response = await api.get('/expenses/categories');
      setCategories(response.data || []);
      if (!formData.category && response.data?.length) {
        setFormData((prev) => ({ ...prev, category: response.data[0].name }));
      }
    } catch (err) {
      console.error('Failed to fetch categories:', err);
      setCategories([]);
    }
  };

  const fetchExpenses = async () => {
    setLoading(true);
    try {
      const params = selectedDay ? { start_date: selectedDay, end_date: selectedDay } : {};
      const response = await api.get('/expenses', { params });
      setExpenses(response.data || []);
    } catch (err) {
      console.error('Failed to fetch expenses:', err);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setShowForm(false);
    setEditingExpense(null);
    setFormData({ category: categories[0]?.name || '', description: '', amount: '', expense_date: today });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSubmittingExpense) return;
    if (!isAdmin && !categories.some((category) => String(category.name) === String(formData.category))) {
      setMessage({ type: 'danger', text: 'Managers must select an existing expense category.' });
      return;
    }
    if (!isAdmin && formData.expense_date !== today) {
      setMessage({ type: 'danger', text: 'Managers can only use the current date for expenses.' });
      return;
    }
    setIsSubmittingExpense(true);
    try {
      const payload = isAdmin ? formData : { ...formData, expense_date: today };
      if (editingExpense) {
        await api.put(`/expenses/${editingExpense.id}`, payload);
      } else {
        await api.post('/expenses', payload);
      }
      await fetchExpenses();
      resetForm();
      setMessage({ type: 'success', text: editingExpense ? 'Expense updated.' : 'Expense created.' });
    } catch (err) {
      if (!editingExpense && !err.response) {
        const idempotencyKey = `expense-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        await enqueueOperation({ url: '/expenses', method: 'post', data: formData, idempotencyKey });
        setMessage({ type: 'warning', text: 'Offline: expense queued for sync.' });
        resetForm();
      } else {
        setMessage({ type: 'danger', text: getErrorMessage(err, 'Failed to save expense.') });
      }
    }
    finally {
      setIsSubmittingExpense(false);
    }
  };

  const handleCreateCategory = async () => {
    if (isSubmittingCategory) return;
    if (!newCategoryName.trim()) return;
    setIsSubmittingCategory(true);
    try {
      const response = await api.post('/expenses/categories', { name: newCategoryName.trim() });
      setCategories((current) => [...current, response.data].sort((a, b) => a.name.localeCompare(b.name)));
      setFormData((prev) => ({ ...prev, category: response.data.name }));
      setNewCategoryName('');
      setMessage({ type: 'success', text: 'Category created.' });
    } catch (err) {
      setMessage({ type: 'danger', text: getErrorMessage(err, 'Failed to create category.') });
    } finally {
      setIsSubmittingCategory(false);
    }
  };

  const handleDeleteCategory = async (categoryId) => {
    if (!window.confirm('Delete this category?')) return;
    try {
      await api.delete(`/expenses/categories/${categoryId}`);
      const next = categories.filter((category) => Number(category.id) !== Number(categoryId));
      setCategories(next);
      setFormData((prev) => ({ ...prev, category: next[0]?.name || '' }));
      setMessage({ type: 'success', text: 'Category deleted.' });
    } catch (err) {
      setMessage({ type: 'danger', text: getErrorMessage(err, 'Failed to delete category.') });
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this expense?')) return;
    try {
      await api.delete(`/expenses/${id}`);
      await fetchExpenses();
      setMessage({ type: 'success', text: 'Expense deleted.' });
    } catch (err) {
      setMessage({ type: 'danger', text: getErrorMessage(err, 'Failed to delete expense.') });
    }
  };

  const getMinutesRemaining = (expense) => {
    const createdAt = expense?.created_at ? new Date(expense.created_at) : null;
    if (!createdAt || Number.isNaN(createdAt.getTime())) return 0;
    const elapsed = (Date.now() - createdAt.getTime()) / 60000;
    return Math.max(0, Math.ceil(EXPENSE_EDIT_WINDOW_MINUTES - elapsed));
  };

  const isEditable = (expense) => {
    if (getMinutesRemaining(expense) <= 0) return false;
    if (isAdmin) return true;
    return Number(expense?.created_by) === Number(user?.id);
  };

  if (loading) return <div className="loading-container"><div className="spinner"></div></div>;

  return (
    <div className="expenses-page">
      <div className="page-header">
        <h2>Expenses Management</h2>
        <button className="btn btn-primary" onClick={() => { setEditingExpense(null); setFormData({ category: categories[0]?.name || '', description: '', amount: '', expense_date: today }); setShowForm(true); }}>
          <Plus size={18} /> Add Expense
        </button>
      </div>

      <div className="card mb-4"><div className="card-body"><div className="row g-3 align-items-end"><div className="col-md-4"><label className="form-label">Filter by Day</label><input type="date" className="form-control" value={selectedDay} onChange={(e) => setSelectedDay(e.target.value)} /></div><div className="col-md-4"><button className="btn btn-outline-secondary" onClick={() => setSelectedDay('')}>Clear Day Filter</button></div></div></div></div>

      <div className="stats-grid mb-4">
        <div className="stat-card card bg-light"><div className="stat-icon bg-danger text-white"><TrendingDown size={24} /></div><div className="stat-content"><h3>ETB {expenses.reduce((sum, exp) => sum + parseFloat(exp.amount || 0), 0).toFixed(2)}</h3><p>Total Expenses</p></div></div>
        <div className="stat-card card bg-light"><div className="stat-icon bg-warning text-white"><DollarSign size={24} /></div><div className="stat-content"><h3>{expenses.length}</h3><p>Total Records</p></div></div>
      </div>

      <div className="card"><div className="card-body"><div className="table-responsive"><table className="table table-hover"><thead><tr><th>Expense ID</th><th>Date</th><th>Category</th><th>Description</th><th>Amount</th><th>Created By</th><th>Edit Window</th><th>Actions</th></tr></thead><tbody>
        {expenses.length === 0 ? <tr><td colSpan={8} className="text-center">No expenses found</td></tr> : expenses.map((expense) => (
          <tr key={expense.id}><td>{expense.expense_code || `EXP-${String(expense.id).padStart(6, '0')}`}</td><td>{new Date(expense.expense_date).toLocaleDateString()}</td><td><span className="badge badge-primary">{expense.category}</span></td><td><button className="btn btn-sm btn-outline-secondary" onClick={() => setShowDescription(expense)}><Eye size={14} /> View</button></td><td><strong>ETB {Number(expense.amount).toFixed(2)}</strong></td><td>{expense.created_by_name || '-'}</td><td>{isEditable(expense) ? <span className="badge badge-warning"><Clock size={12} className="me-1" />{getMinutesRemaining(expense)}m left</span> : <span className="badge badge-secondary">Locked</span>}</td><td><button className="btn btn-sm btn-outline-primary me-2" onClick={() => { if (!isEditable(expense)) return; setEditingExpense(expense); setFormData({ category: expense.category, description: expense.description || '', amount: expense.amount, expense_date: isAdmin ? expense.expense_date : today }); setShowForm(true); }} disabled={!isEditable(expense)}><Edit size={14} /></button><button className="btn btn-sm btn-outline-danger" onClick={() => handleDelete(expense.id)} disabled={!isEditable(expense)}><Trash2 size={14} /></button></td></tr>
        ))}
      </tbody></table></div></div></div>

      {showForm && (
        <div className="modal-overlay" onClick={resetForm}><div className="modal-content" onClick={(e) => e.stopPropagation()}><div className="modal-header"><h3>{editingExpense ? 'Edit Expense' : 'Add New Expense'}</h3><button className="close-btn" onClick={resetForm}>×</button></div>
          <form onSubmit={handleSubmit} className="modal-body">
            <div className="mb-3"><label className="form-label">Category *</label>{categories.length > 0 ? (<select className="form-select" value={formData.category} onChange={(e) => setFormData({ ...formData, category: e.target.value })} required><option value="">Select Category</option>{categories.map((category) => <option key={category.id || category.name} value={category.name}>{category.name}</option>)}</select>) : (<input className="form-control" value={formData.category} readOnly placeholder="No categories available. Ask admin to create one." required />)}</div>
            {!editingExpense && (
              <div className="mb-3">
                <label className="form-label">Manage Categories</label>
                <div className="d-flex gap-2 mb-2"><input className="form-control" value={newCategoryName} placeholder="New category name" onChange={(e) => setNewCategoryName(e.target.value)} /><button type="button" className="btn btn-outline-primary" onClick={handleCreateCategory} disabled={isSubmittingCategory}>{isSubmittingCategory ? 'Creating…' : 'Create'}</button></div>
                <div className="d-flex flex-wrap gap-2">{categories.map((category) => (category.id ? <button key={category.id} type="button" className="btn btn-sm btn-outline-danger" onClick={() => handleDeleteCategory(category.id)}>{category.name} ×</button> : <span key={category.id || category.name} className="badge badge-secondary">{category.name}</span>))}</div>
              </div>
            )}
            <div className="mb-3"><label className="form-label">Description</label><textarea className="form-control" rows="3" value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} /></div>
            <div className="mb-3"><label className="form-label">Amount *</label><input type="number" className="form-control" min="0" step="0.01" value={formData.amount} onChange={(e) => setFormData({ ...formData, amount: e.target.value })} required /></div>
            {isAdmin ? <div className="mb-3"><label className="form-label">Date *</label><input type="date" className="form-control" value={formData.expense_date} onChange={(e) => setFormData({ ...formData, expense_date: e.target.value })} required /></div> : null}
            <div className="modal-footer"><button type="button" className="btn btn-secondary" onClick={resetForm} disabled={isSubmittingExpense}>Cancel</button><button type="submit" className="btn btn-primary" disabled={isSubmittingExpense}>{isSubmittingExpense ? 'Saving…' : (editingExpense ? 'Update Expense' : 'Add Expense')}</button></div>
          </form>
        </div></div>
      )}

      {showDescription && (
        <div className="modal-overlay" onClick={() => setShowDescription(null)}><div className="modal-content" onClick={(e) => e.stopPropagation()}><div className="modal-header"><h3>Expense Description</h3><button className="close-btn" onClick={() => setShowDescription(null)}>×</button></div><div className="modal-body"><p><strong>{showDescription.expense_code || `EXP-${String(showDescription.id).padStart(6, '0')}`}</strong></p><p>{showDescription.description || 'No description provided.'}</p></div></div></div>
      )}
    </div>
  );
}

import { useState, useEffect } from 'react';
import api, { getErrorMessage } from '../../api/axios';
import { useBranch } from '../../context/BranchContext';
import { useAuth } from '../../context/AuthContext';
import { Plus, Edit, Trash2, TrendingDown, DollarSign, Calendar, Clock, Eye } from 'lucide-react';
import { enqueueOperation } from '../../utils/offlineQueue';

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
  const hasManagedCategories = categories.some((category) => category.id);
  const [formData, setFormData] = useState({
    category: '',
    description: '',
    amount: '',
    expense_date: new Date().toISOString().split('T')[0],
  });

  useEffect(() => {
    fetchExpenses();
    fetchCategories();
  }, [selectedLocationId, selectedDay]);

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
    setFormData({ category: categories[0]?.name || '', description: '', amount: '', expense_date: new Date().toISOString().split('T')[0] });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingExpense) {
        await api.put(`/expenses/${editingExpense.id}`, formData);
      } else {
        await api.post('/expenses', formData);
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
  };

  const handleCreateCategory = async () => {
    if (!newCategoryName.trim()) return;
    try {
      const response = await api.post('/expenses/categories', { name: newCategoryName.trim() });
      setCategories((current) => [...current, response.data].sort((a, b) => a.name.localeCompare(b.name)));
      setFormData((prev) => ({ ...prev, category: response.data.name }));
      setNewCategoryName('');
      setMessage({ type: 'success', text: 'Category created.' });
    } catch (err) {
      setMessage({ type: 'danger', text: getErrorMessage(err, 'Failed to create category.') });
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

  const isEditable = (expense) => isAdmin && getMinutesRemaining(expense) > 0;

  if (loading) return <div className="loading-container"><div className="spinner"></div></div>;

  return (
    <div className="expenses-page">
      <div className="page-header">
        <h2>Expenses Management</h2>
        {message && <div className={`alert alert-${message.type}`}>{message.text}</div>}
        <button className="btn btn-primary" onClick={() => { setEditingExpense(null); setFormData({ category: categories[0]?.name || '', description: '', amount: '', expense_date: new Date().toISOString().split('T')[0] }); setShowForm(true); }}>
          <Plus size={18} /> Add Expense
        </button>
      </div>

      <div className="card mb-4"><div className="card-body"><div className="row g-3 align-items-end"><div className="col-md-4"><label className="form-label">Filter by Day</label><input type="date" className="form-control" value={selectedDay} onChange={(e) => setSelectedDay(e.target.value)} /></div><div className="col-md-4"><button className="btn btn-outline-secondary" onClick={() => setSelectedDay('')}>Clear Day Filter</button></div></div></div></div>

      <div className="stats-grid mb-4">
        <div className="stat-card card bg-light"><div className="stat-icon bg-danger text-white"><TrendingDown size={24} /></div><div className="stat-content"><h3>ETB {expenses.reduce((sum, exp) => sum + parseFloat(exp.amount || 0), 0).toFixed(2)}</h3><p>Total Expenses</p></div></div>
        <div className="stat-card card bg-light"><div className="stat-icon bg-warning text-white"><DollarSign size={24} /></div><div className="stat-content"><h3>{expenses.length}</h3><p>Total Records</p></div></div>
        <div className="stat-card card bg-light"><div className="stat-icon bg-info text-white"><Calendar size={24} /></div><div className="stat-content"><h3>ETB {expenses.length > 0 ? (expenses.reduce((sum, exp) => sum + parseFloat(exp.amount || 0), 0) / expenses.length).toFixed(2) : '0.00'}</h3><p>Avg. Expense</p></div></div>
      </div>

      <div className="card"><div className="card-body"><div className="table-responsive"><table className="table table-hover"><thead><tr><th>Expense ID</th><th>Date</th><th>Category</th><th>Description</th><th>Amount</th><th>Created By</th>{isAdmin && <th>Edit Window</th>}{isAdmin && <th>Actions</th>}</tr></thead><tbody>
        {expenses.length === 0 ? <tr><td colSpan={isAdmin ? 8 : 6} className="text-center">No expenses found</td></tr> : expenses.map((expense) => (
          <tr key={expense.id}><td>{expense.expense_code || `EXP-${String(expense.id).padStart(6, '0')}`}</td><td>{new Date(expense.expense_date).toLocaleDateString()}</td><td><span className="badge badge-primary">{expense.category}</span></td><td><button className="btn btn-sm btn-outline-secondary" onClick={() => setShowDescription(expense)}><Eye size={14} /> View</button></td><td><strong>ETB {Number(expense.amount).toFixed(2)}</strong></td><td>{expense.created_by_name || '-'}</td>{isAdmin && <td>{isEditable(expense) ? <span className="badge badge-warning"><Clock size={12} className="me-1" />{getMinutesRemaining(expense)}m left</span> : <span className="badge badge-secondary">Locked</span>}</td>}{isAdmin && <td><button className="btn btn-sm btn-outline-primary me-2" onClick={() => { if (!isEditable(expense)) return; setEditingExpense(expense); setFormData({ category: expense.category, description: expense.description || '', amount: expense.amount, expense_date: expense.expense_date }); setShowForm(true); }} disabled={!isEditable(expense)}><Edit size={14} /></button><button className="btn btn-sm btn-outline-danger" onClick={() => handleDelete(expense.id)} disabled={!isEditable(expense)}><Trash2 size={14} /></button></td>}</tr>
        ))}
      </tbody></table></div></div></div>

      {showForm && (
        <div className="modal-overlay" onClick={resetForm}><div className="modal-content" onClick={(e) => e.stopPropagation()}><div className="modal-header"><h3>{editingExpense ? 'Edit Expense' : 'Add New Expense'}</h3><button className="close-btn" onClick={resetForm}>×</button></div>
          <form onSubmit={handleSubmit} className="modal-body">
            <div className="mb-3"><label className="form-label">Category *</label>{categories.length > 0 ? (<select className="form-select" value={formData.category} onChange={(e) => setFormData({ ...formData, category: e.target.value })} required><option value="">Select Category</option>{categories.map((category) => <option key={category.id || category.name} value={category.name}>{category.name}</option>)}</select>) : (<input className="form-control" placeholder="Type category" value={formData.category} onChange={(e) => setFormData({ ...formData, category: e.target.value })} required />)}</div>
            {isAdmin && !editingExpense && hasManagedCategories && (
              <div className="mb-3">
                <label className="form-label">Manage Categories</label>
                <div className="d-flex gap-2 mb-2"><input className="form-control" value={newCategoryName} placeholder="New category name" onChange={(e) => setNewCategoryName(e.target.value)} /><button type="button" className="btn btn-outline-primary" onClick={handleCreateCategory}>Create</button></div>
                <div className="d-flex flex-wrap gap-2">{categories.map((category) => <button key={category.id} type="button" className="btn btn-sm btn-outline-danger" onClick={() => handleDeleteCategory(category.id)}>{category.name} ×</button>)}</div>
              </div>
            )}
            <div className="mb-3"><label className="form-label">Description</label><textarea className="form-control" rows="3" value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} /></div>
            <div className="mb-3"><label className="form-label">Amount *</label><input type="number" className="form-control" min="0" step="0.01" value={formData.amount} onChange={(e) => setFormData({ ...formData, amount: e.target.value })} required /></div>
            <div className="mb-3"><label className="form-label">Date *</label><input type="date" className="form-control" value={formData.expense_date} onChange={(e) => setFormData({ ...formData, expense_date: e.target.value })} required /></div>
            <div className="modal-footer"><button type="button" className="btn btn-secondary" onClick={resetForm}>Cancel</button><button type="submit" className="btn btn-primary">{editingExpense ? 'Update Expense' : 'Add Expense'}</button></div>
          </form>
        </div></div>
      )}

      {showDescription && (
        <div className="modal-overlay" onClick={() => setShowDescription(null)}><div className="modal-content" onClick={(e) => e.stopPropagation()}><div className="modal-header"><h3>Expense Description</h3><button className="close-btn" onClick={() => setShowDescription(null)}>×</button></div><div className="modal-body"><p><strong>{showDescription.expense_code || `EXP-${String(showDescription.id).padStart(6, '0')}`}</strong></p><p>{showDescription.description || 'No description provided.'}</p></div></div></div>
      )}
    </div>
  );
}

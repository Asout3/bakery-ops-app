import { useState, useEffect } from 'react';
import api, { getErrorMessage } from '../../api/axios';
import { useBranch } from '../../context/BranchContext';
import { Plus, Edit, Trash2, TrendingDown, DollarSign, Calendar } from 'lucide-react';
import { enqueueOperation } from '../../utils/offlineQueue';

export default function ExpensesPage() {
  const { selectedLocationId } = useBranch();
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [message, setMessage] = useState(null);
  const [editingExpense, setEditingExpense] = useState(null);
  const [formData, setFormData] = useState({
    category: '',
    description: '',
    amount: '',
    expense_date: new Date().toISOString().split('T')[0],
    location_id: ''
  });

  useEffect(() => {
    fetchExpenses();
  }, [selectedLocationId]);

  const fetchExpenses = async () => {
    try {
      const response = await api.get('/expenses');
      setExpenses(response.data);
    } catch (err) {
      console.error('Failed to fetch expenses:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingExpense) {
        await api.put(`/expenses/${editingExpense.id}`, formData);
      } else {
        await api.post('/expenses', formData);
      }
      fetchExpenses();
      setShowForm(false);
      setEditingExpense(null);
      setFormData({
        category: '',
        description: '',
        amount: '',
        expense_date: new Date().toISOString().split('T')[0],
        location_id: ''
      });
    } catch (err) {
      if (!editingExpense && !err.response) {
        const idempotencyKey = `expense-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        await enqueueOperation({ url: '/expenses', method: 'post', data: formData, idempotencyKey });
        setMessage({ type: 'warning', text: 'Offline: expense queued for sync.' });
        setShowForm(false);
      } else {
        setMessage({ type: 'danger', text: getErrorMessage(err, 'Failed to save expense.') });
      }
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this expense?')) {
      try {
        await api.delete(`/expenses/${id}`);
        fetchExpenses();
      } catch (err) {
        setMessage({ type: 'danger', text: getErrorMessage(err, 'Failed to delete expense.') });
      }
    }
  };

  const categories = [
    'Utilities', 'Rent', 'Salaries', 'Supplies', 'Marketing', 
    'Maintenance', 'Insurance', 'Loan Payment', 'Taxes', 'Other'
  ];

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
      </div>
    );
  }

  return (
    <div className="expenses-page">
      <div className="page-header">
        <h2>Expenses Management</h2>
        {message && <div className={`alert alert-${message.type}`}>{message.text}</div>}
        <button 
          className="btn btn-primary" 
          onClick={() => {
            setEditingExpense(null);
            setFormData({
              category: '',
              description: '',
              amount: '',
              expense_date: new Date().toISOString().split('T')[0],
              location_id: ''
            });
            setShowForm(true);
          }}
        >
          <Plus size={18} /> Add Expense
        </button>
      </div>

      <div className="stats-grid mb-4">
        <div className="stat-card card bg-light">
          <div className="stat-icon bg-danger text-white">
            <TrendingDown size={24} />
          </div>
          <div className="stat-content">
            <h3>ETB {expenses.reduce((sum, exp) => sum + parseFloat(exp.amount || 0), 0).toFixed(2)}</h3>
            <p>Total Expenses</p>
          </div>
        </div>
        
        <div className="stat-card card bg-light">
          <div className="stat-icon bg-warning text-white">
            <DollarSign size={24} />
          </div>
          <div className="stat-content">
            <h3>{expenses.length}</h3>
            <p>Total Records</p>
          </div>
        </div>
        
        <div className="stat-card card bg-light">
          <div className="stat-icon bg-info text-white">
            <Calendar size={24} />
          </div>
          <div className="stat-content">
            <h3>ETB {expenses.length > 0 ? (expenses.reduce((sum, exp) => sum + parseFloat(exp.amount || 0), 0) / expenses.length).toFixed(2) : '0.00'}</h3>
            <p>Avg. Expense</p>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-body">
          <div className="table-responsive">
            <table className="table table-hover">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Date</th>
                  <th>Category</th>
                  <th>Description</th>
                  <th>Amount</th>
                  <th>Location</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {expenses.map(expense => (
                  <tr key={expense.id}>
                    <td>{expense.id}</td>
                    <td>{new Date(expense.expense_date).toLocaleDateString()}</td>
                    <td>
                      <span className="badge badge-secondary">
                        {expense.category}
                      </span>
                    </td>
                    <td>{expense.description}</td>
                    <td>
                      <span className="text-danger fw-bold">
                        ETB {Number(expense.amount).toFixed(2)}
                      </span>
                    </td>
                    <td>{expense.location_id}</td>
                    <td>
                      <button 
                        className="btn btn-sm btn-outline-primary me-2"
                        onClick={() => {
                          setEditingExpense(expense);
                          setFormData({
                            category: expense.category,
                            description: expense.description,
                            amount: expense.amount,
                            expense_date: expense.expense_date,
                            location_id: expense.location_id
                          });
                          setShowForm(true);
                        }}
                      >
                        <Edit size={14} />
                      </button>
                      <button 
                        className="btn btn-sm btn-outline-danger"
                        onClick={() => handleDelete(expense.id)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editingExpense ? 'Edit Expense' : 'Add New Expense'}</h3>
              <button className="close-btn" onClick={() => setShowForm(false)}>×</button>
            </div>
            <form onSubmit={handleSubmit} className="modal-body">
              <div className="mb-3">
                <label className="form-label">Category *</label>
                <select
                  className="form-select"
                  value={formData.category}
                  onChange={(e) => setFormData({...formData, category: e.target.value})}
                  required
                >
                  <option value="">Select Category</option>
                  {categories.map(category => (
                    <option key={category} value={category}>{category}</option>
                  ))}
                </select>
              </div>
              
              <div className="mb-3">
                <label className="form-label">Description *</label>
                <textarea
                  className="form-control"
                  rows="3"
                  value={formData.description}
                  onChange={(e) => setFormData({...formData, description: e.target.value})}
                  required
                ></textarea>
              </div>
              
              <div className="mb-3">
                <label className="form-label">Amount *</label>
                <input
                  type="number"
                  step="0.01"
                  className="form-control"
                  value={formData.amount}
                  onChange={(e) => setFormData({...formData, amount: e.target.value})}
                  required
                />
              </div>
              
              <div className="row">
                <div className="col-md-6 mb-3">
                  <label className="form-label">Date *</label>
                  <input
                    type="date"
                    className="form-control"
                    value={formData.expense_date}
                    onChange={(e) => setFormData({...formData, expense_date: e.target.value})}
                    required
                  />
                </div>
                <div className="col-md-6 mb-3">
                  <label className="form-label">Location ID</label>
                  <input
                    type="number"
                    className="form-control"
                    value={formData.location_id}
                    onChange={(e) => setFormData({...formData, location_id: e.target.value})}
                  />
                </div>
              </div>
              
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">{editingExpense ? 'Update' : 'Add'} Expense</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
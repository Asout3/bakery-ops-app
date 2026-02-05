import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import Layout from './components/Layout';
import Login from './pages/Login';

// Admin pages
import AdminDashboard from './pages/admin/Dashboard';

// Manager pages
import ManagerInventory from './pages/manager/Inventory';

// Cashier pages
import CashierSales from './pages/cashier/Sales';

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          
          {/* Admin Routes */}
          <Route path="/admin" element={
            <ProtectedRoute roles={['admin']}>
              <Layout />
            </ProtectedRoute>
          }>
            <Route path="dashboard" element={<AdminDashboard />} />
            <Route path="products" element={<div className="card card-body">Products page coming soon</div>} />
            <Route path="inventory" element={<div className="card card-body">Admin Inventory page coming soon</div>} />
            <Route path="sales" element={<div className="card card-body">Sales page coming soon</div>} />
            <Route path="expenses" element={<div className="card card-body">Expenses page coming soon</div>} />
            <Route path="staff-payments" element={<div className="card card-body">Staff Payments page coming soon</div>} />
            <Route path="reports" element={<div className="card card-body">Reports page coming soon</div>} />
            <Route path="notifications" element={<div className="card card-body">Notifications page coming soon</div>} />
          </Route>

          {/* Manager Routes */}
          <Route path="/manager" element={
            <ProtectedRoute roles={['manager', 'admin']}>
              <Layout />
            </ProtectedRoute>
          }>
            <Route path="inventory" element={<ManagerInventory />} />
            <Route path="batches" element={<div className="card card-body">Batches page coming soon</div>} />
            <Route path="products" element={<div className="card card-body">Products page coming soon</div>} />
            <Route path="notifications" element={<div className="card card-body">Notifications page coming soon</div>} />
          </Route>

          {/* Cashier Routes */}
          <Route path="/cashier" element={
            <ProtectedRoute roles={['cashier', 'admin']}>
              <Layout />
            </ProtectedRoute>
          }>
            <Route path="sales" element={<CashierSales />} />
            <Route path="history" element={<div className="card card-body">Sales History page coming soon</div>} />
          </Route>

          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/unauthorized" element={
            <div style={{ padding: '2rem', textAlign: 'center' }}>
              <h1>Unauthorized</h1>
              <p>You don't have permission to access this page.</p>
            </div>
          } />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;


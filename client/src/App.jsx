import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { BranchProvider } from './context/BranchContext';
import { useOfflineSync } from './hooks/useOfflineSync';
import { ProtectedRoute } from './components/ProtectedRoute';
import Layout from './components/Layout';
import Login from './pages/Login';

// Admin pages
import AdminDashboard from './pages/admin/Dashboard';
import ProductsPage from './pages/admin/Products';
import AdminInventory from './pages/admin/Inventory';
import SalesPage from './pages/admin/Sales';
import ExpensesPage from './pages/admin/Expenses';
import StaffPaymentsPage from './pages/admin/StaffPayments';
import ReportsPage from './pages/admin/Reports';
import NotificationsPage from './pages/admin/Notifications';

// Manager pages
import ManagerInventory from './pages/manager/Inventory';
import ManagerBatches from './pages/manager/Batches';
import ManagerProducts from './pages/admin/Products'; // Reuse admin component
import ManagerNotifications from './pages/admin/Notifications'; // Reuse admin component

// Cashier pages
import CashierSales from './pages/cashier/Sales';
import CashierHistory from './pages/cashier/History';

function AppInner() {
  useOfflineSync();

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
            <Route path="products" element={<ProductsPage />} />
            <Route path="inventory" element={<AdminInventory />} />
            <Route path="sales" element={<SalesPage />} />
            <Route path="expenses" element={<ExpensesPage />} />
            <Route path="staff-payments" element={<StaffPaymentsPage />} />
            <Route path="reports" element={<ReportsPage />} />
            <Route path="notifications" element={<NotificationsPage />} />
          </Route>

          {/* Manager Routes */}
          <Route path="/manager" element={
            <ProtectedRoute roles={['manager', 'admin']}>
              <Layout />
            </ProtectedRoute>
          }>
            <Route path="inventory" element={<ManagerInventory />} />
            <Route path="batches" element={<ManagerBatches />} />
            <Route path="products" element={<ManagerProducts />} />
            <Route path="notifications" element={<ManagerNotifications />} />
          </Route>

          {/* Cashier Routes */}
          <Route path="/cashier" element={
            <ProtectedRoute roles={['cashier', 'admin']}>
              <Layout />
            </ProtectedRoute>
          }>
            <Route path="sales" element={<CashierSales />} />
            <Route path="history" element={<CashierHistory />} />
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

function App() {
  return (
    <BranchProvider>
      <AppInner />
    </BranchProvider>
  );
}

export default App;


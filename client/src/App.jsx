import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { BranchProvider } from './context/BranchContext';
import { LanguageProvider } from './context/LanguageContext';
import { NotificationProvider } from './context/NotificationContext';
import { ToastProvider } from './context/ToastContext';
import { ConfirmProvider } from './context/ConfirmContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import Layout from './components/Layout';
import AppErrorBoundary from './components/AppErrorBoundary';

import Login from './pages/Login';
import NotFound from './pages/NotFound';
import AdminDashboard from './pages/admin/Dashboard';
import ProductsPage from './pages/admin/Products';
import AdminInventory from './pages/admin/Inventory';
import SalesPage from './pages/admin/Sales';
import ExpensesPage from './pages/admin/Expenses';
import StaffPaymentsPage from './pages/admin/StaffPayments';
import ReportsPage from './pages/admin/Reports';
import NotificationsPage from './pages/admin/Notifications';
import SyncQueuePage from './pages/admin/SyncQueue';
import BranchesAndStaffPage from './pages/admin/BranchesAndStaff';
import StaffManagementPage from './pages/admin/StaffManagement';
import HistoryLifecyclePage from './pages/admin/HistoryLifecycle';
import ManagerInventory from './pages/manager/Inventory';
import ManagerBatches from './pages/manager/Batches';
import ManagerProducts from './pages/admin/Products';
import ManagerNotifications from './pages/admin/Notifications';
import CashierSales from './pages/cashier/Sales';
import CashierHistory from './pages/cashier/History';

function AppInner() {
  return (
    <BrowserRouter>
      <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/admin" element={<ProtectedRoute roles={['admin']}><Layout /></ProtectedRoute>}>
            <Route path="dashboard" element={<AdminDashboard />} />
            <Route path="products" element={<ProductsPage />} />
            <Route path="inventory" element={<AdminInventory />} />
            <Route path="sales" element={<SalesPage />} />
            <Route path="expenses" element={<ExpensesPage />} />
            <Route path="staff-payments" element={<StaffPaymentsPage />} />
            <Route path="reports" element={<ReportsPage />} />
            <Route path="notifications" element={<NotificationsPage />} />
            <Route path="sync" element={<SyncQueuePage />} />
            <Route path="team" element={<BranchesAndStaffPage />} />
            <Route path="staff" element={<StaffManagementPage />} />
            <Route path="history-lifecycle" element={<HistoryLifecyclePage />} />
          </Route>
          <Route path="/manager" element={<ProtectedRoute roles={['manager', 'admin']}><Layout /></ProtectedRoute>}>
            <Route path="inventory" element={<ManagerInventory />} />
            <Route path="batches" element={<ManagerBatches />} />
            <Route path="orders" element={<Navigate to="/manager/batches" replace />} />
            <Route path="products" element={<ManagerProducts />} />
            <Route path="notifications" element={<ManagerNotifications />} />
          </Route>
          <Route path="/cashier" element={<ProtectedRoute roles={['cashier', 'admin']}><Layout /></ProtectedRoute>}>
            <Route path="sales" element={<CashierSales />} />
            <Route path="orders" element={<Navigate to="/cashier/sales" replace />} />
            <Route path="history" element={<CashierHistory />} />
          </Route>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/unauthorized" element={<div style={{ padding: '2rem', textAlign: 'center' }}><h1>Unauthorized</h1><p>You don't have permission to access this page.</p></div>} />
          <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}

function App() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <BranchProvider>
          <NotificationProvider>
            <ToastProvider>
              <ConfirmProvider>
                <AppErrorBoundary>
                  <AppInner />
                </AppErrorBoundary>
              </ConfirmProvider>
            </ToastProvider>
          </NotificationProvider>
        </BranchProvider>
      </AuthProvider>
    </LanguageProvider>
  );
}

export default App;

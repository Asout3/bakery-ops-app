import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { AuthProvider } from './context/AuthContext';
import { BranchProvider } from './context/BranchContext';
import { LanguageProvider } from './context/LanguageContext';
import { NotificationProvider } from './context/NotificationContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import Layout from './components/Layout';
import AppErrorBoundary from './components/AppErrorBoundary';

const Login = lazy(() => import('./pages/Login'));
const NotFound = lazy(() => import('./pages/NotFound'));
const AdminDashboard = lazy(() => import('./pages/admin/Dashboard'));
const ProductsPage = lazy(() => import('./pages/admin/Products'));
const AdminInventory = lazy(() => import('./pages/admin/Inventory'));
const SalesPage = lazy(() => import('./pages/admin/Sales'));
const ExpensesPage = lazy(() => import('./pages/admin/Expenses'));
const StaffPaymentsPage = lazy(() => import('./pages/admin/StaffPayments'));
const ReportsPage = lazy(() => import('./pages/admin/Reports'));
const NotificationsPage = lazy(() => import('./pages/admin/Notifications'));
const SyncQueuePage = lazy(() => import('./pages/admin/SyncQueue'));
const BranchesAndStaffPage = lazy(() => import('./pages/admin/BranchesAndStaff'));
const StaffManagementPage = lazy(() => import('./pages/admin/StaffManagement'));
const ManagerInventory = lazy(() => import('./pages/manager/Inventory'));
const ManagerBatches = lazy(() => import('./pages/manager/Batches'));
const ManagerProducts = lazy(() => import('./pages/admin/Products'));
const ManagerNotifications = lazy(() => import('./pages/admin/Notifications'));
const CashierSales = lazy(() => import('./pages/cashier/Sales'));
const CashierHistory = lazy(() => import('./pages/cashier/History'));

function PageFallback() {
  return <div className="loading-container"><div className="spinner"></div></div>;
}

function AppInner() {
  return (
    <BrowserRouter>
      <Suspense fallback={<PageFallback />}>
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
          </Route>
          <Route path="/manager" element={<ProtectedRoute roles={['manager', 'admin']}><Layout /></ProtectedRoute>}>
            <Route path="inventory" element={<ManagerInventory />} />
            <Route path="batches" element={<ManagerBatches />} />
            <Route path="products" element={<ManagerProducts />} />
            <Route path="notifications" element={<ManagerNotifications />} />
          </Route>
          <Route path="/cashier" element={<ProtectedRoute roles={['cashier', 'admin']}><Layout /></ProtectedRoute>}>
            <Route path="sales" element={<CashierSales />} />
            <Route path="history" element={<CashierHistory />} />
          </Route>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/unauthorized" element={<div style={{ padding: '2rem', textAlign: 'center' }}><h1>Unauthorized</h1><p>You don't have permission to access this page.</p></div>} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

function App() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <BranchProvider>
          <NotificationProvider>
            <AppErrorBoundary>
              <AppInner />
            </AppErrorBoundary>
          </NotificationProvider>
        </BranchProvider>
      </AuthProvider>
    </LanguageProvider>
  );
}

export default App;

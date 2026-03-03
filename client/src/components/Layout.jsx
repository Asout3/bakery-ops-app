import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  DollarSign,
  Users,
  BarChart3,
  Bell,
  LogOut,
  Menu,
  X,
  Moon,
  Sun,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import api from '../api/axios';
import { useBranch } from '../context/BranchContext';
import { useLanguage } from '../context/LanguageContext';
import OfflineIndicator from './OfflineIndicator';
import { useOfflineSync } from '../hooks/useOfflineSync';
import { getPendingCount } from '../utils/offlineQueue';
import './Layout.css';

export default function Layout() {
  const { user, logout } = useAuth();
  const { unreadCount, refresh: refreshNotifications } = useNotifications();
  useOfflineSync();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [locations, setLocations] = useState([]);
  const { selectedLocationId, setLocation } = useBranch();
  const { language, setLang, t } = useLanguage();
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'light');
  const [showLogoutWarning, setShowLogoutWarning] = useState(false);
  const [pendingLogoutCount, setPendingLogoutCount] = useState(0);

  const doLogout = () => {
    logout();
    navigate('/login');
  };

  const handleLogout = async () => {
    const pendingCount = await getPendingCount();
    if (pendingCount > 0) {
      setPendingLogoutCount(pendingCount);
      setShowLogoutWarning(true);
      return;
    }
    doLogout();
  };

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    const fetchLocations = async () => {
      if (!user) return;
      try {
        const response = await api.get('/locations');
        const raw = response.data || [];
        const scoped = user?.role === 'admin' ? raw : raw.filter((loc) => Number(loc.id) === Number(user?.location_id));
        setLocations(scoped);
        const singleLocation = user?.location_id || scoped[0]?.id;
        if (singleLocation && Number(selectedLocationId || 0) !== Number(singleLocation)) {
          setLocation(singleLocation);
        }
      } catch (err) {
        console.error('Failed to fetch locations:', err);
      }
    };

    fetchLocations();
  }, [user?.role, user?.location_id, selectedLocationId, setLocation]);

  useEffect(() => {
    refreshNotifications();
  }, [user?.id, user?.role, selectedLocationId, refreshNotifications]);

  const navItems = useMemo(() => {
    const role = user?.role;

    if (role === 'admin') {
      return [
        { to: '/admin/dashboard', icon: LayoutDashboard, label: t('dashboard') },
        { to: '/admin/products', icon: Package, label: t('products') },
        { to: '/admin/inventory', icon: Package, label: t('inventory') },
        { to: '/admin/sales', icon: ShoppingCart, label: t('sales') },
        { to: '/admin/expenses', icon: DollarSign, label: t('expenses') },
        { to: '/admin/staff-payments', icon: Users, label: t('staffPayments') },
        { to: '/admin/reports', icon: BarChart3, label: t('reports') },
        { to: '/admin/notifications', icon: Bell, label: t('notifications'), showBadge: true },
        { to: '/admin/sync', icon: BarChart3, label: t('syncQueue') },
        { to: '/admin/staff', icon: Users, label: t('staffManagement') },
        { to: '/admin/history-lifecycle', icon: BarChart3, label: t('historyLifecycle') },
      ];
    }
    if (role === 'manager') {
      return [
        { to: '/manager/inventory', icon: Package, label: t('inventory') },
        { to: '/manager/batches', icon: Package, label: t('batches') },
        { to: '/manager/products', icon: Package, label: t('products') },
        { to: '/manager/notifications', icon: Bell, label: t('notifications'), showBadge: true },
      ];
    }
    if (role === 'cashier') {
      return [
        { to: '/cashier/sales', icon: ShoppingCart, label: t('newSale') },
        { to: '/cashier/history', icon: BarChart3, label: 'Sales History' },
      ];
    }
    return [];
  }, [user?.role, t]);

  const activeLocationName = locations.find((loc) => Number(loc.id) === Number(selectedLocationId))?.name || locations[0]?.name || 'Main';

  return (
    <div className="layout">
      <aside className={`sidebar ${sidebarOpen ? 'sidebar-open' : ''}`}>
        <div className="sidebar-header">
          <h2>Sina Sweet</h2>
          <button className="sidebar-close" onClick={() => setSidebarOpen(false)}>
            <X size={20} />
          </button>
        </div>

        <nav className="sidebar-nav">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `nav-item ${isActive ? 'nav-item-active' : ''}`}
              onClick={() => setSidebarOpen(false)}
            >
              <item.icon size={20} />
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}>
                {item.label}
                {item.showBadge && unreadCount > 0 && (
                  <span className="badge badge-danger" style={{ fontSize: '0.68rem' }}>{unreadCount}</span>
                )}
              </span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="user-info">
            <div className="user-avatar">{user?.username?.charAt(0).toUpperCase()}</div>
            <div className="user-details">
              <div className="user-name">{user?.username}</div>
              <div className="user-role">{user?.role}</div>
            </div>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={handleLogout}>
            <LogOut size={16} /> {t('logout')}
          </button>
        </div>
      </aside>

      <div className="main-content">
        <header className="top-bar">
          <button className="menu-toggle" onClick={() => setSidebarOpen(true)}>
            <Menu size={24} />
          </button>
          <div className="top-bar-content" style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <h1 className="page-title">{t('appTitle')}</h1>
            <span className="badge badge-secondary">{activeLocationName}</span>
            <button className="btn btn-sm btn-secondary" onClick={() => setTheme((prev) => (prev === 'light' ? 'dark' : 'light'))}>
              {theme === 'light' ? <Moon size={14} /> : <Sun size={14} />} {t(theme === 'light' ? 'dark' : 'light')}
            </button>
            <select className="form-select" style={{ maxWidth: '140px' }} value={language} onChange={(e) => setLang(e.target.value)}>
              <option value="en">English</option>
              <option value="am">አማርኛ</option>
            </select>
          </div>
        </header>

        <main className="content">
          <Outlet />
        </main>
      </div>

      {sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />}
      <OfflineIndicator />

      {showLogoutWarning && (
        <div className="modal-overlay" onClick={() => setShowLogoutWarning(false)}>
          <div className="modal-content modal-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Pending Offline Actions</h3>
              <button className="close-btn" onClick={() => setShowLogoutWarning(false)}>×</button>
            </div>
            <div className="modal-body">
              <p>
                You have <strong>{pendingLogoutCount}</strong> offline action(s) pending.
                These will be forwarded to admin for syncing when online.
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowLogoutWarning(false)}>Cancel</button>
              <button className="btn btn-danger" onClick={() => { setShowLogoutWarning(false); doLogout(); }}>
                Logout Anyway
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

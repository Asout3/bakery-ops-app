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
  ClipboardList,
  Globe,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import api from '../api/axios';
import { useBranch } from '../context/BranchContext';
import { useLanguage } from '../context/LanguageContext';
import OfflineIndicator from './OfflineIndicator';
import { useOfflineSync } from '../hooks/useOfflineSync';
import { getPendingCount } from '../utils/offlineQueue';
import { Button } from './ui/Button';
import { Modal } from './ui/Modal';
import { Select } from './ui/Select';
import { Badge } from './ui/Badge';
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
        { to: '/admin/team', icon: Users, label: t('accountManagement') },
        { to: '/admin/staff', icon: Users, label: t('staffManagement') },
        { to: '/admin/history-lifecycle', icon: BarChart3, label: t('historyLifecycle') },
        { to: '/admin/orders', icon: ClipboardList, label: t('orders') },
      ];
    }
    if (role === 'manager') {
      return [
        { to: '/manager/inventory', icon: Package, label: t('inventory') },
        { to: '/manager/batches', icon: Package, label: t('batches') },
        { to: '/manager/orders', icon: ClipboardList, label: t('ordersQueue') },
        { to: '/manager/expenses', icon: DollarSign, label: t('expenses') },
        { to: '/manager/notifications', icon: Bell, label: t('notifications'), showBadge: true },
      ];
    }
    if (role === 'cashier') {
      return [
        { to: '/cashier/sales', icon: ShoppingCart, label: t('newSale') },
        { to: '/cashier/orders', icon: ClipboardList, label: t('preOrders') },
        { to: '/cashier/history', icon: BarChart3, label: t('salesHistory') },
      ];
    }
    return [];
  }, [user?.role, t]);

  return (
    <div className="layout">
      <aside className={`sidebar ${sidebarOpen ? 'sidebar-open' : ''}`}>
        <div className="sidebar-header">
          <h2>{t('appTitle')}</h2>
          <button className="menu-toggle" onClick={() => setSidebarOpen(false)}>
            <X size={24} />
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
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1 }}>
                {item.label}
                {item.showBadge && unreadCount > 0 && (
                  <Badge variant="danger" style={{ marginLeft: 'auto', padding: '0.125rem 0.375rem', fontSize: '0.65rem' }}>{unreadCount}</Badge>
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
          <Button variant="secondary" size="sm" onClick={handleLogout} style={{ width: '100%' }}>
            <LogOut size={16} /> {t('logout')}
          </Button>
        </div>
      </aside>

      <div className="main-content">
        <header className="top-bar">
          <div className="top-bar-left">
            <button className="menu-toggle" onClick={() => setSidebarOpen(true)}>
              <Menu size={24} />
            </button>
            {user?.role === 'admin' && locations.length > 0 && (
              <Select
                value={selectedLocationId || ''}
                onChange={(e) => setLocation(e.target.value)}
                options={locations.map(loc => ({ label: loc.name, value: loc.id }))}
                style={{ minHeight: '2.25rem', padding: '0.4rem 2rem 0.4rem 0.75rem', fontSize: '0.875rem' }}
              />
            )}
          </div>

          <div className="top-bar-right">
            <Button variant="secondary" size="sm" onClick={() => setTheme((prev) => (prev === 'light' ? 'dark' : 'light'))}>
              {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
              <span>{t(theme === 'light' ? 'dark' : 'light')}</span>
            </Button>

            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <Globe size={16} style={{ position: 'absolute', left: '0.75rem', color: 'var(--text-muted)', pointerEvents: 'none' }} />
              <select
                className="input-field"
                style={{ width: '120px', minHeight: '2.25rem', padding: '0.4rem 0.75rem 0.4rem 2.25rem', fontSize: '0.875rem' }}
                value={language}
                onChange={(e) => setLang(e.target.value)}
              >
                <option value="en">English</option>
                <option value="am">አማርኛ</option>
              </select>
            </div>
          </div>
        </header>

        <main className="content">
          <Outlet />
        </main>
      </div>

      {sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />}
      <OfflineIndicator />

      <Modal
        isOpen={showLogoutWarning}
        onClose={() => setShowLogoutWarning(false)}
        title={t('pendingOfflineActions')}
        size="sm"
      >
        <p style={{ marginBottom: '1.5rem' }}>
          {t('pendingOfflineDetails')} <strong>{pendingLogoutCount}</strong>
        </p>
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
          <Button variant="secondary" onClick={() => setShowLogoutWarning(false)}>{t('cancel')}</Button>
          <Button variant="danger" onClick={() => { setShowLogoutWarning(false); doLogout(); }}>
            {t('logoutAnyway')}
          </Button>
        </div>
      </Modal>
    </div>
  );
}

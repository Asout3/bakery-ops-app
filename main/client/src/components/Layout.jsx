import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import {
  LayoutDashboard, Package, ShoppingCart, DollarSign, Users,
  BarChart3, Bell, LogOut, Menu, X, Moon, Sun, ClipboardList,
  Layers, History, RefreshCw, Trash2, Printer, Globe,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import api from '../api/axios';
import { useBranch } from '../context/BranchContext';
import { useLanguage } from '../context/LanguageContext';
import { useToast } from '../context/ToastContext';
import OfflineIndicator from './OfflineIndicator';
import { useOfflineSync } from '../hooks/useOfflineSync';
import { getSyncStats } from '../utils/offlineQueue';
import { getReceiptConfigCache, normalizeReceiptSettings } from '../receipts/helpers';
import './Layout.css';

export default function Layout() {
  const { user, logout } = useAuth();
  const { unreadCount, refresh: refreshNotifications } = useNotifications();
  const offlineSync = useOfflineSync();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [locations, setLocations] = useState([]);
  const { selectedLocationId, setLocation } = useBranch();
  const { language, setLang, t } = useLanguage();
  const toast = useToast();
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'light');
  const [showLogoutWarning, setShowLogoutWarning] = useState(false);
  const [pendingLogoutCount, setPendingLogoutCount] = useState(0);

  const doLogout = () => { logout(); navigate('/login'); };

  const handleLogout = async () => {
    const syncStats = await getSyncStats();
    const unsyncedCount = Number(syncStats?.total || 0);
    if (unsyncedCount > 0) {
      setPendingLogoutCount(unsyncedCount);
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
        const scoped = user?.role === 'admin'
          ? raw
          : raw.filter((loc) => Number(loc.id) === Number(user?.location_id));
        setLocations(scoped);

        const availableIds = new Set(scoped.map((loc) => String(loc.id)));
        const currentSelection = String(selectedLocationId || '').trim();
        const hasCurrentSelection = currentSelection && availableIds.has(currentSelection);
        if (hasCurrentSelection) {
          return;
        }

        const preferredLocation = [user?.location_id, scoped[0]?.id]
          .map((value) => (value ? String(value) : ''))
          .find((value) => value && availableIds.has(value));

        if (preferredLocation) {
          setLocation(preferredLocation);
          return;
        }

        if (selectedLocationId) {
          setLocation('');
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

  useEffect(() => {
    if (!user) return undefined;
    let disposed = false;

    const notifyPrinterStatus = async () => {
      const cachedConfig = getReceiptConfigCache();
      const receiptSettings = normalizeReceiptSettings(cachedConfig?.settings || {});
      if (receiptSettings.printerProfile.saleAdapter === 'bluetooth') {
        if (receiptSettings.printerProfile.bluetoothDeviceName) {
          toast.success(`POS connected via bluetooth: ${receiptSettings.printerProfile.bluetoothDeviceName}`);
        } else {
          toast.warning('Bluetooth printer not paired yet. Open Receipt Settings to pair.');
        }
        return;
      }
      if (receiptSettings.printerProfile.saleAdapter === 'network' && receiptSettings.printerProfile.networkEnabled && receiptSettings.printerProfile.networkHost) {
        try {
          const statusResponse = await api.post('/sales/network-printer/status', {
            host: receiptSettings.printerProfile.networkHost,
            port: receiptSettings.printerProfile.networkPort,
          });
          if (statusResponse.data?.connected) {
            toast.success('POS connected via network printer.');
          } else {
            toast.warning('POS network printer not connected.');
          }
        } catch {
          toast.warning('POS network printer status unavailable.');
        }
        return;
      }
      if (receiptSettings.printerProfile.saleAdapter === 'network') {
        try {
          const statusResponse = await api.post('/sales/network-printer/status', {});
          if (statusResponse.data?.connected) toast.success('POS connected via network printer.');
          else toast.warning('POS network printer not connected.');
        } catch {
          toast.warning('POS network printer status unavailable.');
        }
        return;
      }
      if (!navigator.usb || typeof navigator.usb.getDevices !== 'function') {
        toast.warning('Thermal printer not detected. Connect printer and allow USB access.');
        return;
      }
      try {
        const devices = await navigator.usb.getDevices();
        if (disposed) return;
        if (devices.length > 0) {
          toast.success('Thermal printer plugged in.');
        } else {
          toast.warning('Thermal printer not plugged in.');
        }
      } catch {
        if (!disposed) toast.warning('Thermal printer status unavailable.');
      }
    };

    const handleConnect = () => toast.success('Thermal printer plugged in.');
    const handleDisconnect = () => toast.warning('Thermal printer not plugged in.');

    notifyPrinterStatus();
    navigator.usb?.addEventListener?.('connect', handleConnect);
    navigator.usb?.addEventListener?.('disconnect', handleDisconnect);
    return () => {
      disposed = true;
      navigator.usb?.removeEventListener?.('connect', handleConnect);
      navigator.usb?.removeEventListener?.('disconnect', handleDisconnect);
    };
  }, [toast, user]);

  const navItems = useMemo(() => {
    const role = user?.role;
    if (role === 'admin') {
      return [
        { to: '/admin/dashboard',        icon: LayoutDashboard, label: t('dashboard') },
        { to: '/admin/products',          icon: Package,         label: t('products') },
        { to: '/admin/inventory',         icon: Layers,          label: t('inventory') },
        { to: '/admin/sales',             icon: ShoppingCart,    label: t('sales') },
        { to: '/admin/expenses',          icon: DollarSign,      label: t('expenses') },
        { to: '/admin/staff-payments',    icon: Users,           label: t('staffPayments') },
        { to: '/admin/reports',           icon: BarChart3,       label: t('reports') },
        { to: '/admin/notifications',     icon: Bell,            label: t('notifications'), showBadge: true },
        { to: '/admin/waste',             icon: Trash2,          label: 'Waste' },
        { to: '/admin/sync',              icon: RefreshCw,       label: t('syncQueue') },
        { to: '/admin/team',              icon: Users,           label: t('accountManagement') },
        { to: '/admin/staff',             icon: Users,           label: t('staffManagement') },
        { to: '/admin/history-lifecycle', icon: History,         label: t('historyLifecycle') },
        { to: '/admin/orders',            icon: ClipboardList,   label: t('orders') },
        { to: '/admin/receipt-settings',  icon: Printer,         label: t('receiptSettings') },
      ];
    }
    if (role === 'manager') {
      return [
        { to: '/manager/inventory',    icon: Layers,        label: t('inventory') },
        { to: '/manager/batches',      icon: Package,       label: t('batches') },
        { to: '/manager/orders',       icon: ClipboardList, label: t('ordersQueue') },
        { to: '/manager/expenses',     icon: DollarSign,    label: t('expenses') },
        { to: '/manager/notifications',icon: Bell,          label: t('notifications'), showBadge: true },
      ];
    }
    if (role === 'cashier') {
      return [
        { to: '/cashier/sales',   icon: ShoppingCart, label: t('newSale') },
        { to: '/cashier/orders',  icon: ClipboardList,label: t('preOrders') },
        { to: '/cashier/history', icon: History,      label: t('salesHistory') },
      ];
    }
    return [];
  }, [user?.role, t]);


  return (
    <div className="layout">
      {/* ── Sidebar ───────────────────────────── */}
      <aside className={`sidebar ${sidebarOpen ? 'sidebar-open' : ''}`} aria-label="Sidebar navigation">
        <div className="sidebar-header">
          <div className="sidebar-brand">
            <div className="sidebar-brand-icon">
              <ShoppingCart size={14} />
            </div>
            <span className="sidebar-brand-name">{t('appTitle')}</span>
          </div>
          <button className="sidebar-close" onClick={() => setSidebarOpen(false)} aria-label="Close sidebar">
            <X size={18} />
          </button>
        </div>

        <nav className="sidebar-nav" aria-label="Main navigation">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `nav-item ${isActive ? 'nav-item-active' : ''}`}
              onClick={() => setSidebarOpen(false)}
            >
              <item.icon size={18} strokeWidth={2} />
              <span style={{ flex: 1 }}>{item.label}</span>
              {item.showBadge && unreadCount > 0 && (
                <span className="nav-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="user-info">
            <div className="user-avatar" aria-hidden="true">
              {user?.username?.charAt(0).toUpperCase()}
            </div>
            <div className="user-details">
              <div className="user-name">{user?.username}</div>
              <div className="user-role">{user?.role}</div>
            </div>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={handleLogout} style={{ width: '100%' }}>
            <LogOut size={14} /> {t('logout')}
          </button>
        </div>
      </aside>

      {/* ── Main area ─────────────────────────── */}
      <div className="main-content">
        <header className="top-bar" role="banner">
          <button className="menu-toggle" onClick={() => setSidebarOpen(true)} aria-label="Open sidebar">
            <Menu size={20} />
          </button>

          <div className="top-bar-right">
            {/* Location selector — admin only */}
            {user?.role === 'admin' && locations.length > 1 && (
              <div className="top-bar-location-wrap">
                <select
                  className="form-select"
                  value={selectedLocationId || ''}
                  onChange={(e) => setLocation(e.target.value)}
                  aria-label="Select location"
                >
                  <option value="">All Locations</option>
                  {locations.map((loc) => (
                    <option key={loc.id} value={loc.id}>{loc.name}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="top-bar-preferences" role="group" aria-label="Language and theme controls">
              {/* Language toggle */}
              <label className="language-control" htmlFor="language-select">
                <Globe size={15} aria-hidden="true" />
                <select
                  id="language-select"
                  className="form-select"
                  value={language}
                  onChange={(e) => setLang(e.target.value)}
                  aria-label="Select language"
                >
                  <option value="en">English</option>
                  <option value="am">አማርኛ</option>
                </select>
              </label>

              {/* Theme toggle */}
              <button
                className="btn btn-secondary btn-sm btn-icon top-bar-theme-btn"
                onClick={() => setTheme((p) => (p === 'light' ? 'dark' : 'light'))}
                aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
                title={theme === 'light' ? t('dark') : t('light')}
              >
                {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
              </button>
            </div>
          </div>
        </header>

        <main className="content" id="main-content">
          <Outlet />
        </main>
      </div>

      {/* ── Mobile overlay ────────────────────── */}
      {sidebarOpen && (
        <div
          className="sidebar-overlay"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      <OfflineIndicator sync={offlineSync} />

      {/* ── Pending-logout warning modal ──────── */}
      {showLogoutWarning && (
        <div className="modal-overlay" onClick={() => setShowLogoutWarning(false)}>
          <div className="modal-content modal-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{t('pendingOfflineActions')}</h3>
              <button className="close-btn" onClick={() => setShowLogoutWarning(false)}>×</button>
            </div>
            <div className="modal-body">
              <p className="alert alert-warning mb-0">
                {t('pendingOfflineDetails')} <strong>({pendingLogoutCount})</strong>
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowLogoutWarning(false)}>
                {t('cancel')}
              </button>
              <button
                className="btn btn-danger"
                onClick={() => { setShowLogoutWarning(false); doLogout(); }}
              >
                <LogOut size={14} /> {t('logoutAnyway')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

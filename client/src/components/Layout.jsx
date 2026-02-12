import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
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
  X
} from 'lucide-react';
import { useEffect, useState } from 'react';
import api from '../api/axios';
import { useBranch } from '../context/BranchContext';
import { useLanguage } from '../context/LanguageContext';
import './Layout.css';

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [locations, setLocations] = useState([]);
  const { selectedLocationId, setLocation } = useBranch();
  const { language, setLang, t } = useLanguage();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };


  useEffect(() => {
    const fetchLocations = async () => {
      if (!user) return;
      try {
        const response = await api.get('/locations');
        const raw = response.data || [];
        const scoped = user?.role === 'admin' ? raw : raw.filter((loc) => Number(loc.id) === Number(user?.location_id));
        setLocations(scoped);
        if (!selectedLocationId && scoped.length > 0) {
          setLocation(scoped[0].id);
        }
      } catch (err) {
        console.error('Failed to fetch locations:', err);
      }
    };

    fetchLocations();
  }, [user?.role, selectedLocationId, setLocation]);

  const getNavItems = () => {
    const role = user?.role;
    
    if (role === 'admin') {
      return [
        { to: '/admin/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
        { to: '/admin/products', icon: Package, label: 'Products' },
        { to: '/admin/inventory', icon: Package, label: 'Inventory' },
        { to: '/admin/sales', icon: ShoppingCart, label: 'Sales' },
        { to: '/admin/expenses', icon: DollarSign, label: 'Expenses' },
        { to: '/admin/staff-payments', icon: Users, label: 'Staff Payments' },
        { to: '/admin/reports', icon: BarChart3, label: 'Reports' },
        { to: '/admin/notifications', icon: Bell, label: 'Notifications' },
        { to: '/admin/sync', icon: BarChart3, label: 'Sync Queue' },
        { to: '/admin/team', icon: Users, label: 'Branches & Staff' },
      ];
    } else if (role === 'manager') {
      return [
        { to: '/manager/inventory', icon: Package, label: 'Inventory' },
        { to: '/manager/batches', icon: Package, label: 'Batches' },
        { to: '/manager/products', icon: Package, label: 'Products' },
        { to: '/manager/notifications', icon: Bell, label: 'Notifications' },
      ];
    } else if (role === 'cashier') {
      return [
        { to: '/cashier/sales', icon: ShoppingCart, label: 'New Sale' },
        { to: '/cashier/history', icon: BarChart3, label: 'Sales History' },
      ];
    }
    
    return [];
  };

  const navItems = getNavItems();

  return (
    <div className="layout">
      <aside className={`sidebar ${sidebarOpen ? 'sidebar-open' : ''}`}>
        <div className="sidebar-header">
          <h2>Bakery Ops</h2>
          <button 
            className="sidebar-close"
            onClick={() => setSidebarOpen(false)}
          >
            <X size={20} />
          </button>
        </div>

        <nav className="sidebar-nav">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => 
                `nav-item ${isActive ? 'nav-item-active' : ''}`
              }
              onClick={() => setSidebarOpen(false)}
            >
              <item.icon size={20} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="user-info">
            <div className="user-avatar">
              {user?.username?.charAt(0).toUpperCase()}
            </div>
            <div className="user-details">
              <div className="user-name">{user?.username}</div>
              <div className="user-role">{user?.role}</div>
            </div>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={handleLogout}>
            <LogOut size={16} />
            Logout
          </button>
        </div>
      </aside>

      <div className="main-content">
        <header className="top-bar">
          <button 
            className="menu-toggle"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu size={24} />
          </button>
          <div className="top-bar-content" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <h1 className="page-title">{t('appTitle')}</h1>
            <select
              className="form-select"
              style={{ maxWidth: '220px' }}
              value={selectedLocationId || ''}
              onChange={(e) => setLocation(e.target.value)}
            >
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {t('branch')}: {loc.name}
                </option>
              ))}
            </select>
            <select
              className="form-select"
              style={{ maxWidth: '140px' }}
              value={language}
              onChange={(e) => setLang(e.target.value)}
            >
              <option value="en">English</option>
              <option value="am">አማርኛ</option>
            </select>
          </div>
        </header>

        <main className="content">
          <Outlet />
        </main>
      </div>

      {sidebarOpen && (
        <div 
          className="sidebar-overlay"
          onClick={() => setSidebarOpen(false)}
        />
      )}
    </div>
  );
}

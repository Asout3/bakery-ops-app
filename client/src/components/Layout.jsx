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
import { useState } from 'react';
import './Layout.css';

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

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
          <div className="top-bar-content">
            <h1 className="page-title">Bakery Operations System</h1>
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

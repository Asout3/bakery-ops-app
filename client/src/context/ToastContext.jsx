import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const pushToast = useCallback((toast) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const next = { id, type: 'info', duration: 4000, ...toast };
    setToasts((prev) => [...prev, next]);
    window.setTimeout(() => removeToast(id), next.duration);
  }, [removeToast]);

  const value = useMemo(() => ({
    pushToast,
    success: (message, options = {}) => pushToast({ ...options, type: 'success', message }),
    error: (message, options = {}) => pushToast({ ...options, type: 'error', message }),
    warning: (message, options = {}) => pushToast({ ...options, type: 'warning', message }),
    info: (message, options = {}) => pushToast({ ...options, type: 'info', message }),
  }), [pushToast]);

  const icons = {
    success: <CheckCircle size={20} />,
    error: <AlertCircle size={20} />,
    warning: <AlertTriangle size={20} />,
    info: <Info size={20} />,
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-stack" style={{ position: 'fixed', top: '1.5rem', right: '1.5rem', zIndex: 9999, display: 'flex', flexDirection: 'column', gap: '0.75rem', maxWidth: '400px', width: 'calc(100% - 3rem)' }}>
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, x: 50, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 20, scale: 0.95 }}
              layout
              className={`toast-item toast-${toast.type}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                padding: '1rem 1.25rem',
                borderRadius: 'var(--radius)',
                boxShadow: 'var(--shadow-lg)',
                color: '#fff',
                backgroundColor: toast.type === 'success' ? '#3f8f4f' : toast.type === 'error' ? '#a83d2a' : toast.type === 'warning' ? '#c97b2b' : '#8d5a3b',
              }}
            >
              <div style={{ flexShrink: 0 }}>{icons[toast.type]}</div>
              <div style={{ flex: 1, fontWeight: 600, fontSize: '0.9375rem' }}>{toast.message}</div>
              <button
                onClick={() => removeToast(toast.id)}
                style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', padding: '0.25rem', opacity: 0.8 }}
              >
                <X size={18} />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within ToastProvider');
  return context;
}

import { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { Modal } from '../components/ui/Modal';
import { Button } from '../components/ui/Button';
import { AlertTriangle } from 'lucide-react';
import { useLanguage } from './LanguageContext';

const ConfirmContext = createContext(null);

export function ConfirmProvider({ children }) {
  const [config, setConfig] = useState(null);
  const { t } = useLanguage();

  const confirm = useCallback((options) => {
    return new Promise((resolve) => {
      setConfig({
        ...options,
        resolve,
      });
    });
  }, []);

  const handleClose = useCallback(() => {
    if (config) {
      config.resolve(false);
      setConfig(null);
    }
  }, [config]);

  const handleConfirm = useCallback(() => {
    if (config) {
      config.resolve(true);
      setConfig(null);
    }
  }, [config]);

  const value = useMemo(() => ({ confirm }), [confirm]);

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      <Modal
        isOpen={!!config}
        onClose={handleClose}
        title={config?.title || t('confirm')}
        size="sm"
      >
        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
          <div style={{ color: config?.variant === 'danger' ? 'var(--text-error)' : 'var(--button-end)', flexShrink: 0 }}>
            <AlertTriangle size={32} />
          </div>
          <div>
            <p style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.25rem' }}>{config?.title || t('confirm')}</p>
            <p style={{ fontSize: '0.9375rem' }}>{config?.message || t('confirmAction')}</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
          <Button variant="secondary" onClick={handleClose}>
            {config?.cancelText || t('cancel')}
          </Button>
          <Button variant={config?.variant === 'danger' ? 'danger' : 'primary'} onClick={handleConfirm}>
            {config?.confirmText || t('confirm')}
          </Button>
        </div>
      </Modal>
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const context = useContext(ConfirmContext);
  if (!context) throw new Error('useConfirm must be used within ConfirmProvider');
  return context;
}

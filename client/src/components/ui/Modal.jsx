import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { clsx } from 'clsx';

const Modal = ({ isOpen, onClose, title, children, className, size = 'md' }) => {
  if (typeof document === 'undefined') return null;

  const sizes = {
    sm: 'max-w-md',
    md: 'max-w-2xl',
    lg: 'max-w-4xl',
    full: 'max-w-[95vw]',
  };

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="modal-overlay"
            style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className={clsx('card animate-fade-in', className)}
            style={{ position: 'fixed', zIndex: 1001, width: '100%', maxWidth: size === 'md' ? '672px' : size === 'sm' ? '448px' : size === 'lg' ? '896px' : '95vw', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', maxHeight: '90vh', overflow: 'auto', backgroundColor: 'var(--card-bg)' }}
          >
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>{title}</h3>
              <button onClick={onClose} className="btn btn-secondary" style={{ padding: '0.25rem' }}>
                <X size={20} />
              </button>
            </div>
            <div className="card-body">
              {children}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
};

export { Modal };

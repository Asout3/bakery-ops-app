import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, ShoppingCart, AlertCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import api, { getErrorMessage } from '../api/axios';
import { loginSchema } from '../utils/validation/authSchemas';
import './Login.css';

const validatePassword = (v) => /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,}$/.test(v);

export default function Login() {
  const [showPassword, setShowPassword] = useState(false);

  const [showRecoveryModal, setShowRecoveryModal] = useState(false);
  const [recoveryUsername, setRecoveryUsername] = useState('');
  const [recoveryKey, setRecoveryKey] = useState('');
  const [recoveryPassword, setRecoveryPassword] = useState('');
  const [recoveryConfirm, setRecoveryConfirm] = useState('');
  const [showRecoveryPass, setShowRecoveryPass] = useState(false);
  const [showRecoveryConfirm, setShowRecoveryConfirm] = useState(false);
  const [recoveryLoading, setRecoveryLoading] = useState(false);
  const [recoveryMessage, setRecoveryMessage] = useState('');
  const [recoveryMessageType, setRecoveryMessageType] = useState('info');

  const [loginError, setLoginError] = useState('');

  const { login } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();

  const {
    register: registerLogin,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset: resetLogin,
  } = useForm({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: '',
      password: '',
    },
    mode: 'onTouched',
  });

  const handleLoginSubmit = async (values) => {
    setLoginError('');
    try {
      const user = await login(values.username.trim(), values.password);
      resetLogin();
      if (user.role === 'admin') navigate('/admin/dashboard');
      else if (user.role === 'manager') navigate('/manager/inventory');
      else if (user.role === 'cashier') navigate('/cashier/sales');
    } catch (err) {
      setLoginError(getErrorMessage(err, 'Login failed. Please check your credentials.'));
    }
  };

  const handleRecoverPassword = async (e) => {
    e.preventDefault();
    setRecoveryMessage('');

    if (!recoveryUsername || !recoveryKey || !recoveryPassword || !recoveryConfirm) {
      setRecoveryMessage(t('fillAllRecoveryFields'));
      setRecoveryMessageType('warning');
      return;
    }
    if (!validatePassword(recoveryPassword)) {
      setRecoveryMessage(t('passwordPolicyHint'));
      setRecoveryMessageType('warning');
      return;
    }
    if (recoveryPassword !== recoveryConfirm) {
      setRecoveryMessage(t('passwordMismatch'));
      setRecoveryMessageType('warning');
      return;
    }

    setRecoveryLoading(true);
    try {
      const res = await api.post('/auth/recover-admin-account', {
        username: recoveryUsername,
        recovery_key: recoveryKey,
        new_password: recoveryPassword,
      });
      setRecoveryMessage(res.data?.message || t('adminPasswordResetSuccess'));
      setRecoveryMessageType('success');
      setRecoveryPassword('');
      setRecoveryConfirm('');
      setRecoveryKey('');
    } catch (err) {
      const code = err.response?.data?.code;
      setRecoveryMessage(
        code === 'RECOVERY_NOT_CONFIGURED'
          ? t('recoveryDisabled')
          : getErrorMessage(err, 'Recovery failed'),
      );
      setRecoveryMessageType('danger');
    } finally {
      setRecoveryLoading(false);
    }
  };

  return (
    <div className="login-page">
      <motion.div
        className="login-panel"
        aria-hidden="true"
        initial={{ opacity: 0, x: -30 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
      >
        <div className="login-panel-content">
          <div className="login-panel-icon">
            <ShoppingCart size={36} />
          </div>
          <h2 className="login-panel-heading">{t('appTitle')}</h2>
          <p className="login-panel-sub">Bakery Operations System</p>
          <div className="login-panel-dots">
            <span /><span /><span />
          </div>
        </div>
      </motion.div>

      <motion.div
        className="login-form-panel"
        initial={{ opacity: 0, x: 30 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
      >
        <motion.div
          className="login-card animate-fade-up"
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.05, ease: 'easeOut' }}
        >
          <div className="login-card-header">
            <h1>{t('signIn')}</h1>
            <p>{t('welcomeBack')}</p>
          </div>

          <form onSubmit={handleSubmit(handleLoginSubmit)} className="login-form" noValidate>
            {loginError && (
              <div className="alert alert-danger login-error" role="alert">
                <AlertCircle size={16} />
                <span>{loginError}</span>
              </div>
            )}

            <div className="form-group">
              <label className="form-label" htmlFor="username">{t('username')}</label>
              <input
                id="username"
                type="text"
                className={`form-control${errors.username ? ' is-invalid' : ''}`}
                autoComplete="username"
                autoFocus
                required
                {...registerLogin('username')}
              />
              {errors.username && <div className="form-feedback-error">{errors.username.message}</div>}
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="password">{t('password')}</label>
              <div className="password-field">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  className={`form-control${errors.password ? ' is-invalid' : ''}`}
                  autoComplete="current-password"
                  required
                  {...registerLogin('password')}
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowPassword((p) => !p)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
              {errors.password && <div className="form-feedback-error">{errors.password.message}</div>}
            </div>

            <button
              type="submit"
              className="btn btn-primary btn-lg login-submit"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <><span className="spinner" style={{ width: '1rem', height: '1rem', borderWidth: '2px' }} /> {t('signingIn')}</>
              ) : t('signIn')}
            </button>
          </form>

          <div className="login-footer">
            <button
              type="button"
              className="btn btn-outline-secondary btn-sm"
              onClick={() => {
                setRecoveryPassword('');
                setRecoveryConfirm('');
                setShowRecoveryModal(true);
              }}
            >
              {t('forgotAdminPassword')}
            </button>
          </div>
        </motion.div>
      </motion.div>

      {showRecoveryModal && (
        <div
          className="modal-overlay"
          onClick={() => setShowRecoveryModal(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="recovery-title"
        >
          <motion.div
            className="modal-content"
            onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
          >
            <div className="modal-header">
              <h3 id="recovery-title">{t('recoverAdminPassword')}</h3>
              <button className="close-btn" onClick={() => setShowRecoveryModal(false)}>×</button>
            </div>

            <form className="modal-body" onSubmit={handleRecoverPassword}>
              {recoveryMessage && (
                <div className={`alert alert-${recoveryMessageType} mb-3`}>{recoveryMessage}</div>
              )}

              <div className="form-group mb-3">
                <label className="form-label">{t('adminUsername')}</label>
                <input
                  className="form-control"
                  value={recoveryUsername}
                  onChange={(e) => setRecoveryUsername(e.target.value)}
                  required
                />
              </div>

              <div className="form-group mb-3">
                <label className="form-label">{t('recoveryKey')}</label>
                <input
                  className="form-control"
                  value={recoveryKey}
                  onChange={(e) => setRecoveryKey(e.target.value)}
                  required
                />
              </div>

              <div className="form-group mb-3">
                <label className="form-label">{t('newPassword')}</label>
                <div className="password-field">
                  <input
                    type={showRecoveryPass ? 'text' : 'password'}
                    className={`form-control${recoveryPassword && !validatePassword(recoveryPassword) ? ' is-invalid' : ''}`}
                    value={recoveryPassword}
                    onChange={(e) => setRecoveryPassword(e.target.value)}
                    autoComplete="new-password"
                    required
                  />
                  <button type="button" className="password-toggle" onClick={() => setShowRecoveryPass((p) => !p)}>
                    {showRecoveryPass ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
                {recoveryPassword && !validatePassword(recoveryPassword) && (
                  <div className="form-feedback-error">{t('passwordPolicyHint')}</div>
                )}
              </div>

              <div className="form-group mb-3">
                <label className="form-label">{t('confirmNewPassword')}</label>
                <div className="password-field">
                  <input
                    type={showRecoveryConfirm ? 'text' : 'password'}
                    className={`form-control${recoveryConfirm && recoveryConfirm !== recoveryPassword ? ' is-invalid' : ''}`}
                    value={recoveryConfirm}
                    onChange={(e) => setRecoveryConfirm(e.target.value)}
                    autoComplete="new-password"
                    required
                  />
                  <button type="button" className="password-toggle" onClick={() => setShowRecoveryConfirm((p) => !p)}>
                    {showRecoveryConfirm ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
              </div>

              <div className="alert alert-warning mb-3">{t('recoveryHelp')}</div>

              <div className="modal-footer" style={{ padding: 0, border: 0, justifyContent: 'flex-start', gap: '0.65rem' }}>
                <button type="submit" className="btn btn-primary" disabled={recoveryLoading}>
                  {recoveryLoading ? t('resetting') : t('resetPassword')}
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => setShowRecoveryModal(false)}>
                  {t('closeModal')}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
}

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import api, { getErrorMessage } from '../api/axios';
import './Login.css';

const validatePassword = (value) => /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,}$/.test(value);

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showRecoveryModal, setShowRecoveryModal] = useState(false);
  const [recoveryUsername, setRecoveryUsername] = useState('');
  const [recoveryKey, setRecoveryKey] = useState('');
  const [recoveryPassword, setRecoveryPassword] = useState('');
  const [recoveryPasswordConfirm, setRecoveryPasswordConfirm] = useState('');
  const [showRecoveryPassword, setShowRecoveryPassword] = useState(false);
  const [showRecoveryPasswordConfirm, setShowRecoveryPasswordConfirm] = useState(false);
  const [recoveryLoading, setRecoveryLoading] = useState(false);
  const [recoveryMessage, setRecoveryMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [touched, setTouched] = useState({ username: false, password: false });
  const { login } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();

  const usernameError = touched.username && !username.trim() ? t('requiredField') : '';
  const passwordError = touched.password && !password.trim() ? t('requiredField') : '';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setTouched({ username: true, password: true });
    if (!username.trim() || !password.trim()) {
      setError(t('invalidCredentials'));
      return;
    }

    setError('');
    setLoading(true);

    try {
      const user = await login(username, password);
      if (user.role === 'admin') navigate('/admin/dashboard');
      else if (user.role === 'manager') navigate('/manager/inventory');
      else if (user.role === 'cashier') navigate('/cashier/sales');
    } catch (err) {
      setError(getErrorMessage(err, 'Login failed'));
    } finally {
      setLoading(false);
    }
  };

  const handleRecoverPassword = async (e) => {
    e.preventDefault();
    setRecoveryMessage('');
    if (!recoveryUsername || !recoveryKey || !recoveryPassword || !recoveryPasswordConfirm) {
      setRecoveryMessage(t('fillAllRecoveryFields'));
      return;
    }
    if (!validatePassword(recoveryPassword)) {
      setRecoveryMessage(t('passwordPolicyHint'));
      return;
    }
    if (recoveryPassword !== recoveryPasswordConfirm) {
      setRecoveryMessage(t('passwordMismatch'));
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
      setRecoveryPassword('');
      setRecoveryPasswordConfirm('');
      setRecoveryKey('');
    } catch (err) {
      const apiCode = err.response?.data?.code;
      const baseMessage = getErrorMessage(err, 'Recovery failed');
      setRecoveryMessage(apiCode === 'RECOVERY_NOT_CONFIGURED' ? t('recoveryDisabled') : baseMessage);
    } finally {
      setRecoveryLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card card">
        <div className="login-header">
          <h1>{t('appTitle')}</h1>
          <p>{t('welcomeBack')}</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form" noValidate>
          {error && <div className="alert alert-danger">{error}</div>}
          <div className="form-group">
            <label className="label" htmlFor="username">{t('username')}</label>
            <input id="username" type="text" className={`input ${usernameError ? 'is-invalid' : ''}`} value={username} onBlur={() => setTouched((prev) => ({ ...prev, username: true }))} onChange={(e) => setUsername(e.target.value)} required autoFocus />
            {usernameError && <small className="field-error">{usernameError}</small>}
          </div>

          <div className="form-group">
            <label className="label" htmlFor="password">{t('password')}</label>
            <div className="password-field">
              <input id="password" type={showPassword ? 'text' : 'password'} className={`input ${passwordError ? 'is-invalid' : ''}`} value={password} onBlur={() => setTouched((prev) => ({ ...prev, password: true }))} onChange={(e) => setPassword(e.target.value)} required />
              <button type="button" className="password-toggle" onClick={() => setShowPassword((prev) => !prev)}>
                {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
            {passwordError && <small className="field-error">{passwordError}</small>}
          </div>

          <button type="submit" className="btn btn-primary btn-lg" disabled={loading}>{loading ? t('signingIn') : t('signIn')}</button>
          <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => setShowRecoveryModal(true)}>{t('forgotAdminPassword')}</button>
        </form>
      </div>

      {showRecoveryModal && (
        <div className="modal-overlay" onClick={() => setShowRecoveryModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{t('recoverAdminPassword')}</h3>
              <button className="close-btn" onClick={() => setShowRecoveryModal(false)}>×</button>
            </div>
            <form className="modal-body" onSubmit={handleRecoverPassword}>
              {recoveryMessage && <div className="alert alert-info mb-3">{recoveryMessage}</div>}
              <div className="mb-3">
                <label className="form-label">{t('adminUsername')}</label>
                <input className="form-control" value={recoveryUsername} onChange={(e) => setRecoveryUsername(e.target.value)} required />
              </div>
              <div className="mb-3">
                <label className="form-label">{t('recoveryKey')}</label>
                <input className="form-control" value={recoveryKey} onChange={(e) => setRecoveryKey(e.target.value)} required />
              </div>
              <div className="mb-3">
                <label className="form-label">{t('newPassword')}</label>
                <div className="password-field">
                  <input type={showRecoveryPassword ? 'text' : 'password'} className={`form-control ${recoveryPassword && !validatePassword(recoveryPassword) ? 'is-invalid' : ''}`} value={recoveryPassword} onChange={(e) => setRecoveryPassword(e.target.value)} required />
                  <button type="button" className="password-toggle" onClick={() => setShowRecoveryPassword((prev) => !prev)}>{showRecoveryPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button>
                </div>
              </div>
              <div className="mb-3">
                <label className="form-label">{t('confirmNewPassword')}</label>
                <div className="password-field">
                  <input type={showRecoveryPasswordConfirm ? 'text' : 'password'} className={`form-control ${recoveryPasswordConfirm && recoveryPasswordConfirm !== recoveryPassword ? 'is-invalid' : ''}`} value={recoveryPasswordConfirm} onChange={(e) => setRecoveryPasswordConfirm(e.target.value)} required />
                  <button type="button" className="password-toggle" onClick={() => setShowRecoveryPasswordConfirm((prev) => !prev)}>{showRecoveryPasswordConfirm ? <EyeOff size={17} /> : <Eye size={17} />}</button>
                </div>
              </div>
              <div className="d-flex gap-2">
                <button className="btn btn-primary" disabled={recoveryLoading}>{recoveryLoading ? t('resetting') : t('resetPassword')}</button>
                <button type="button" className="btn btn-secondary" onClick={() => setShowRecoveryModal(false)}>{t('closeModal')}</button>
              </div>
              <div className="alert alert-warning mt-2 mb-0">{t('recoveryHelp')}</div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

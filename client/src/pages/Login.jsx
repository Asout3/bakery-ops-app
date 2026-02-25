import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import api, { getErrorMessage } from '../api/axios';
import './Login.css';

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
  const { login } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const user = await login(username, password);
      if (user.role === 'admin') {
        navigate('/admin/dashboard');
      } else if (user.role === 'manager') {
        navigate('/manager/inventory');
      } else if (user.role === 'cashier') {
        navigate('/cashier/sales');
      }
    } catch (err) {
      setError(getErrorMessage(err, 'Login failed'));
    } finally {
      setLoading(false);
    }
  };

  const handleRecoverPassword = async (e) => {
    e.preventDefault();
    setRecoveryMessage('');
    if (!recoveryUsername || !recoveryKey || !recoveryPassword) {
      setRecoveryMessage('Fill all recovery fields.');
      return;
    }
    if (recoveryPassword !== recoveryPasswordConfirm) {
      setRecoveryMessage('New password and confirmation do not match.');
      return;
    }

    setRecoveryLoading(true);
    try {
      const res = await api.post('/auth/recover-admin-account', {
        username: recoveryUsername,
        recovery_key: recoveryKey,
        new_password: recoveryPassword,
      });
      setRecoveryMessage(res.data?.message || 'Admin password reset successfully. You can login now.');
      setRecoveryPassword('');
      setRecoveryPasswordConfirm('');
      setRecoveryKey('');
    } catch (err) {
      setRecoveryMessage(getErrorMessage(err, 'Recovery failed'));
    } finally {
      setRecoveryLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card card">
        <div className="login-header">
          <h1>Bakery Operations</h1>
          <p>Sign in to your account</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          {error && <div className="alert alert-danger">{error}</div>}

          <div className="form-group">
            <label className="label" htmlFor="username">{t('username')}</label>
            <input
              id="username"
              type="text"
              className="input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoFocus
            />
          </div>

          <div className="form-group">
            <label className="label" htmlFor="password">{t('password')}</label>
            <div className="password-field">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                className="input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button type="button" className="password-toggle" onClick={() => setShowPassword((prev) => !prev)} aria-label="Toggle password visibility">
                {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-lg"
            disabled={loading}
          >
            {loading ? t('signingIn') : t('signIn')}
          </button>
          <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => setShowRecoveryModal(true)}>
            Forgot admin password?
          </button>
        </form>

        <div className="login-footer">
          <p className="demo-info">{t('demo')}</p>
          <div className="demo-creds">
            <div>Admin: admin / admin123</div>
          </div>
        </div>
      </div>

      {showRecoveryModal && (
        <div className="modal-overlay" onClick={() => setShowRecoveryModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Recover Admin Password</h3>
              <button className="close-btn" onClick={() => setShowRecoveryModal(false)}>×</button>
            </div>
            <form className="modal-body" onSubmit={handleRecoverPassword}>
              {recoveryMessage && <div className="alert alert-info mb-3">{recoveryMessage}</div>}
              <div className="mb-3">
                <label className="form-label">Admin Username</label>
                <input className="form-control" value={recoveryUsername} onChange={(e) => setRecoveryUsername(e.target.value)} required />
              </div>
              <div className="mb-3">
                <label className="form-label">Recovery Key</label>
                <input className="form-control" value={recoveryKey} onChange={(e) => setRecoveryKey(e.target.value)} required />
              </div>
              <div className="mb-3">
                <label className="form-label">New Password</label>
                <div className="password-field">
                  <input type={showRecoveryPassword ? 'text' : 'password'} className="form-control" value={recoveryPassword} onChange={(e) => setRecoveryPassword(e.target.value)} required />
                  <button type="button" className="password-toggle" onClick={() => setShowRecoveryPassword((prev) => !prev)}>
                    {showRecoveryPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
              </div>
              <div className="mb-3">
                <label className="form-label">Confirm New Password</label>
                <div className="password-field">
                  <input type={showRecoveryPasswordConfirm ? 'text' : 'password'} className="form-control" value={recoveryPasswordConfirm} onChange={(e) => setRecoveryPasswordConfirm(e.target.value)} required />
                  <button type="button" className="password-toggle" onClick={() => setShowRecoveryPasswordConfirm((prev) => !prev)}>
                    {showRecoveryPasswordConfirm ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
              </div>
              <div className="d-flex gap-2">
                <button className="btn btn-primary" disabled={recoveryLoading}>{recoveryLoading ? 'Resetting...' : 'Reset Password'}</button>
                <button type="button" className="btn btn-secondary" onClick={() => setShowRecoveryModal(false)}>Close</button>
              </div>
              <small className="text-muted mt-2 d-block">Ask deployment owner to set ADMIN_RECOVERY_KEY in server environment before using this feature.</small>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Lock, User, KeyRound } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import api, { getErrorMessage } from '../api/axios';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Card, CardHeader, CardBody } from '../components/ui/Card';
import { Modal } from '../components/ui/Modal';
import { Alert } from '../components/ui/Alert';
import './Login.css';

const loginSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
});

const recoverySchema = z.object({
  username: z.string().min(1, 'Admin username is required'),
  recoveryKey: z.string().min(1, 'Recovery key is required'),
  newPassword: z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string().min(1, 'Please confirm your password'),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

export default function Login() {
  const [showPassword, setShowPassword] = useState(false);
  const [showRecoveryModal, setShowRecoveryModal] = useState(false);
  const [showRecoveryPassword, setShowRecoveryPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [recoveryLoading, setRecoveryLoading] = useState(false);
  const [recoveryMessage, setRecoveryMessage] = useState({ type: 'info', text: '' });

  const { login } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();

  const { register: registerLogin, handleSubmit: handleLoginSubmit, formState: { errors: loginErrors } } = useForm({
    resolver: zodResolver(loginSchema),
  });

  const { register: registerRecovery, handleSubmit: handleRecoverySubmit, formState: { errors: recoveryErrors }, reset: resetRecovery } = useForm({
    resolver: zodResolver(recoverySchema),
  });

  const onLogin = async (data) => {
    setError('');
    setLoading(true);

    try {
      const user = await login(data.username, data.password);
      if (user.role === 'admin') navigate('/admin/dashboard');
      else if (user.role === 'manager') navigate('/manager/inventory');
      else if (user.role === 'cashier') navigate('/cashier/sales');
    } catch (err) {
      setError(getErrorMessage(err, 'Login failed'));
    } finally {
      setLoading(false);
    }
  };

  const onRecover = async (data) => {
    setRecoveryMessage({ type: 'info', text: '' });
    setRecoveryLoading(true);
    try {
      const res = await api.post('/auth/recover-admin-account', {
        username: data.username,
        recovery_key: data.recoveryKey,
        new_password: data.newPassword,
      });
      setRecoveryMessage({ type: 'success', text: res.data?.message || t('adminPasswordResetSuccess') });
      resetRecovery();
    } catch (err) {
      const apiCode = err.response?.data?.code;
      const baseMessage = getErrorMessage(err, 'Recovery failed');
      setRecoveryMessage({
        type: 'error',
        text: apiCode === 'RECOVERY_NOT_CONFIGURED' ? t('recoveryDisabled') : baseMessage
      });
    } finally {
      setRecoveryLoading(false);
    }
  };

  return (
    <div className="login-container" style={{ display: 'grid', placeItems: 'center', minHeight: '100vh', padding: '1.5rem', background: 'linear-gradient(135deg, var(--primary-bg) 0%, #e5d5c0 100%)' }}>
      <Card className="login-card" style={{ width: '100%', maxWidth: '440px', boxShadow: 'var(--shadow-lg)' }}>
        <CardHeader style={{ textAlign: 'center', padding: '2.5rem 2rem 1.5rem' }}>
          <div style={{ width: '64px', height: '64px', background: 'linear-gradient(135deg, var(--button-start), var(--button-end))', borderRadius: '16px', margin: '0 auto 1.5rem', display: 'grid', placeItems: 'center', boxShadow: '0 8px 16px rgba(244, 162, 97, 0.3)' }}>
            <Lock color="#fff" size={32} />
          </div>
          <h1 style={{ marginBottom: '0.5rem', fontSize: '1.75rem' }}>{t('appTitle')}</h1>
          <p>{t('welcomeBack')}</p>
        </CardHeader>

        <CardBody style={{ padding: '0 2rem 2.5rem' }}>
          <form onSubmit={handleLoginSubmit(onLogin)} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {error && <Alert variant="error">{error}</Alert>}

            <Input
              label={t('username')}
              placeholder="Enter your username"
              {...registerLogin('username')}
              error={loginErrors.username?.message}
              icon={<User size={18} />}
            />

            <div style={{ position: 'relative' }}>
              <Input
                label={t('password')}
                type={showPassword ? 'text' : 'password'}
                placeholder="Enter your password"
                {...registerLogin('password')}
                error={loginErrors.password?.message}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{ position: 'absolute', right: '0.75rem', top: '2.45rem', background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '0.25rem' }}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>

            <Button type="submit" isLoading={loading} size="lg" style={{ marginTop: '0.5rem' }}>
              {t('signIn')}
            </Button>

            <button
              type="button"
              className="btn-ghost"
              onClick={() => setShowRecoveryModal(true)}
              style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '0.875rem', cursor: 'pointer', textDecoration: 'underline' }}
            >
              {t('forgotAdminPassword')}
            </button>
          </form>
        </CardBody>
      </Card>

      <Modal
        isOpen={showRecoveryModal}
        onClose={() => { setShowRecoveryModal(false); setRecoveryMessage({ type: 'info', text: '' }); resetRecovery(); }}
        title={t('recoverAdminPassword')}
        size="sm"
      >
        <form onSubmit={handleRecoverySubmit(onRecover)} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {recoveryMessage.text && <Alert variant={recoveryMessage.type}>{recoveryMessage.text}</Alert>}

          <Input
            label={t('adminUsername')}
            {...registerRecovery('username')}
            error={recoveryErrors.username?.message}
          />

          <Input
            label={t('recoveryKey')}
            {...registerRecovery('recoveryKey')}
            error={recoveryErrors.recoveryKey?.message}
            icon={<KeyRound size={18} />}
          />

          <div style={{ position: 'relative' }}>
            <Input
              label={t('newPassword')}
              type={showRecoveryPassword ? 'text' : 'password'}
              {...registerRecovery('newPassword')}
              error={recoveryErrors.newPassword?.message}
            />
            <button
              type="button"
              onClick={() => setShowRecoveryPassword(!showRecoveryPassword)}
              style={{ position: 'absolute', right: '0.75rem', top: '2.45rem', background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
            >
              {showRecoveryPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>

          <Input
            label={t('confirmNewPassword')}
            type="password"
            {...registerRecovery('confirmPassword')}
            error={recoveryErrors.confirmPassword?.message}
          />

          <Alert variant="warning" style={{ fontSize: '0.8125rem' }}>
            {t('recoveryHelp')}
          </Alert>

          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
            <Button variant="secondary" onClick={() => setShowRecoveryModal(false)} type="button">
              {t('closeModal')}
            </Button>
            <Button type="submit" isLoading={recoveryLoading}>
              {t('resetPassword')}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

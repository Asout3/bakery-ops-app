import { createContext, useContext, useState, useEffect } from 'react';
import api from '../api/axios';
import { clearSession, getSessionSnapshot, persistSession, getRefreshToken } from '../utils/authSession';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const bootstrap = async () => {
      const session = getSessionSnapshot();
      if (!session?.token || !session?.user) {
        setLoading(false);
        return;
      }

      setUser(session.user);

      try {
        const response = await api.get('/auth/me', { headers: { 'X-Skip-Auth-Redirect': 'true' }, timeout: 8000 });
        persistSession({ user: response.data });
        setUser(response.data);
      } catch (err) {
        if (!err?.response) {
          setUser(session.user);
        } else {
          clearSession();
          setUser(null);
        }
      } finally {
        setLoading(false);
      }
    };

    bootstrap();
  }, []);

  const login = async (username, password) => {
    const response = await api.post('/auth/login', { username, password }, { timeout: 30000 });
    const { user: nextUser, token, refresh_token: refreshToken, refresh_token_expires_at: refreshTokenExpiresAt } = response.data;
    persistSession({ user: nextUser, token, refreshToken, refreshTokenExpiresAt });
    setUser(nextUser);
    return nextUser;
  };

  const register = async (userData) => {
    const response = await api.post('/auth/register', userData);
    const { user: nextUser, token, refresh_token: refreshToken, refresh_token_expires_at: refreshTokenExpiresAt } = response.data;
    persistSession({ user: nextUser, token, refreshToken, refreshTokenExpiresAt });
    setUser(nextUser);
    return nextUser;
  };

  const updateSession = (nextUser, nextToken) => {
    persistSession({ user: nextUser, token: nextToken });
    if (nextUser) setUser(nextUser);
  };

  const logout = async () => {
    try {
      await api.post('/auth/logout', { refresh_token: getRefreshToken() }, { headers: { 'X-Skip-Auth-Redirect': 'true' } });
    } catch {
      return;
    }
    clearSession();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, updateSession, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

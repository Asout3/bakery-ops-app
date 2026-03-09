const SESSION_KEYS = {
  token: 'token',
  refreshToken: 'refresh_token',
  refreshTokenExpiresAt: 'refresh_token_expires_at',
  user: 'user',
};

function readFromStorage(storage) {
  const token = storage.getItem(SESSION_KEYS.token);
  const refreshToken = storage.getItem(SESSION_KEYS.refreshToken);
  const refreshTokenExpiresAt = storage.getItem(SESSION_KEYS.refreshTokenExpiresAt);
  const userRaw = storage.getItem(SESSION_KEYS.user);

  if (!token && !refreshToken && !userRaw) return null;

  let user = null;
  if (userRaw) {
    try {
      user = JSON.parse(userRaw);
    } catch {
      user = null;
    }
  }

  return { token, refreshToken, refreshTokenExpiresAt, user };
}

export function getSessionSnapshot() {
  const active = readFromStorage(sessionStorage);
  if (active) return active;

  const legacy = readFromStorage(localStorage);
  if (!legacy) return null;

  if (legacy.token) sessionStorage.setItem(SESSION_KEYS.token, legacy.token);
  if (legacy.refreshToken) sessionStorage.setItem(SESSION_KEYS.refreshToken, legacy.refreshToken);
  if (legacy.refreshTokenExpiresAt) sessionStorage.setItem(SESSION_KEYS.refreshTokenExpiresAt, legacy.refreshTokenExpiresAt);
  if (legacy.user) sessionStorage.setItem(SESSION_KEYS.user, JSON.stringify(legacy.user));

  clearLegacySession();
  return legacy;
}

export function persistSession({ token, refreshToken, refreshTokenExpiresAt, user }) {
  if (token) sessionStorage.setItem(SESSION_KEYS.token, token);
  if (refreshToken) sessionStorage.setItem(SESSION_KEYS.refreshToken, refreshToken);
  if (refreshTokenExpiresAt) sessionStorage.setItem(SESSION_KEYS.refreshTokenExpiresAt, refreshTokenExpiresAt);
  if (user) sessionStorage.setItem(SESSION_KEYS.user, JSON.stringify(user));
  clearLegacySession();
}

export function clearSession() {
  Object.values(SESSION_KEYS).forEach((key) => sessionStorage.removeItem(key));
  clearLegacySession();
}

export function getAccessToken() {
  return getSessionSnapshot()?.token || null;
}

export function getRefreshToken() {
  return getSessionSnapshot()?.refreshToken || null;
}

function clearLegacySession() {
  Object.values(SESSION_KEYS).forEach((key) => localStorage.removeItem(key));
}

'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, getToken, setToken, type Schemas } from './clientApi';

export type User = Schemas['User'];

/** Who is logged in (null when nobody), loaded once from /api/me with the stored token. */
export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!getToken()) {
      setUser(null);
      setLoading(false);
      return;
    }
    const me = await api<User>('/api/me');
    if (!me.ok && me.status === 401) setToken(null); // an expired or logged-out token
    setUser(me.ok ? me.data : null);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const logout = useCallback(async () => {
    await api('/api/auth/logout', { method: 'POST' });
    setToken(null);
    setUser(null);
  }, []);

  return { user, loading, refresh, logout };
}

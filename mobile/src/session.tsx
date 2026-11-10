import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ApiError, fetchMe, logout, request, RequestOptions, User } from './api';
import { clearToken, getApiUrl, getToken } from './storage';

type SessionState =
  | { status: 'loading' }
  | { status: 'out'; apiUrl: string; notice: string | null }
  | { status: 'in'; user: User; token: string; apiUrl: string }
  | { status: 'offline'; token: string; apiUrl: string; message: string };

interface SessionValue {
  state: SessionState;
  signedIn: (session: { user: User; token: string; apiUrl: string }) => void;
  signOut: () => Promise<void>;
  /** A launch-time check that failed because the server was unreachable, tried again. */
  retry: () => Promise<void>;
  /** Calls the API as the logged-in user; a rejected token signs them out. */
  api: <T>(path: string, options?: RequestOptions) => Promise<T>;
}

const SessionContext = createContext<SessionValue | null>(null);

export function useSession() {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used inside SessionProvider');
  return value;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ status: 'loading' });

  /** On launch: a saved token is checked against the server before showing the app. */
  const restore = useCallback(async () => {
    const [token, apiUrl] = await Promise.all([getToken(), getApiUrl()]);
    if (!token) return setState({ status: 'out', apiUrl, notice: null });
    try {
      setState({ status: 'in', user: await fetchMe(apiUrl, token), token, apiUrl });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        await clearToken();
        setState({ status: 'out', apiUrl, notice: 'Your session has ended. Please log in again.' });
      } else {
        setState({ status: 'offline', token, apiUrl, message: err instanceof Error ? err.message : 'Could not reach the server.' });
      }
    }
  }, []);

  useEffect(() => {
    void restore();
  }, [restore]);

  const token = state.status === 'in' || state.status === 'offline' ? state.token : null;
  const apiUrl = state.status === 'loading' ? null : state.apiUrl;

  const signOut = useCallback(async () => {
    if (!token || !apiUrl) return;
    await logout(apiUrl, token).catch(() => undefined); // offline: still sign out on this phone
    await clearToken();
    setState({ status: 'out', apiUrl, notice: null });
  }, [token, apiUrl]);

  const api = useCallback(
    async <T,>(path: string, options: RequestOptions = {}) => {
      if (!token || !apiUrl) throw new ApiError(401, 'Please log in again.');
      try {
        return await request<T>(apiUrl, path, { ...options, token });
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          await clearToken();
          setState({ status: 'out', apiUrl, notice: 'Your session has ended. Please log in again.' });
        }
        throw err;
      }
    },
    [token, apiUrl],
  );

  const value = useMemo<SessionValue>(
    () => ({ state, signedIn: (session) => setState({ status: 'in', ...session }), signOut, retry: restore, api }),
    [state, signOut, restore, api],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

/** The logged-in user; only for screens behind the login guard. */
export function useUser() {
  const { state } = useSession();
  if (state.status !== 'in') throw new Error('Not logged in');
  return { user: state.user, apiUrl: state.apiUrl, can: (tag: string) => state.user.permissions.includes(tag) };
}

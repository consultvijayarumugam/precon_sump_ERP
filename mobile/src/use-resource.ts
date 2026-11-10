import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { useSession } from './session';

/**
 * GETs a path whenever the screen comes into focus. Old data stays on screen
 * while refreshing, and if a refresh fails.
 */
export function useResource<T>(path: string) {
  const { api } = useSession();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const latest = useRef(0);

  const load = useCallback(
    async (pulled: boolean) => {
      const run = ++latest.current;
      if (pulled) setRefreshing(true);
      try {
        const result = await api<T>(path);
        if (run === latest.current) {
          setData(result);
          setError(null);
        }
      } catch (err) {
        if (run === latest.current) setError(err instanceof Error ? err.message : 'Could not load this.');
      } finally {
        if (run === latest.current) setRefreshing(false);
      }
    },
    [api, path],
  );

  useFocusEffect(
    useCallback(() => {
      void load(false);
    }, [load]),
  );

  return { data, error, refreshing, refresh: useCallback(() => void load(true), [load]), reload: useCallback(() => void load(false), [load]) };
}

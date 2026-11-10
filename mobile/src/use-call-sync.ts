import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { checkCallPermission, firstTimeExplaining } from './call-permission';
import { consumeCallPlaced, syncCalls } from './call-sync';
import { useSession, useUser } from './session';

const RETRY_MS = 60_000;
/** Android can take a few seconds after hang-up to write the call to its log. */
const AFTER_CALL_DELAYS_MS = [5_000, 15_000];

/** Keeps the phone's work calls flowing to the server while the app is open. */
export function useCallSync() {
  const router = useRouter();
  const { api } = useSession();
  const { user } = useUser();
  const userId = user.id;

  useEffect(() => {
    const timers = new Set<ReturnType<typeof setTimeout>>();
    let alive = true;

    const later = (fn: () => void, ms: number) => {
      const timer = setTimeout(() => {
        timers.delete(timer);
        fn();
      }, ms);
      timers.add(timer);
    };

    const sync = async () => {
      const result = await syncCalls(api, userId);
      if (alive && result.status === 'failed' && AppState.currentState === 'active') later(() => void sync(), RETRY_MS);
    };

    void (async () => {
      if ((await checkCallPermission()) === 'denied' && (await firstTimeExplaining()) && alive) router.push('/call-tracking');
      else if (alive) void sync();
    })();

    const subscription = AppState.addEventListener('change', (next) => {
      if (next !== 'active') return;
      void sync();
      if (consumeCallPlaced()) for (const delay of AFTER_CALL_DELAYS_MS) later(() => void sync(), delay);
    });

    return () => {
      alive = false;
      subscription.remove();
      for (const timer of timers) clearTimeout(timer);
    };
  }, [api, userId, router]);
}

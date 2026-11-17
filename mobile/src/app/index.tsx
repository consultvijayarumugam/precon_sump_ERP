import { HomeScreen } from '../screens/HomeScreen';
import { SalesHomeScreen } from '../screens/SalesHomeScreen';
import { WorklistScreen } from '../screens/WorklistScreen';
import { useSession, useUser } from '../session';

/** Telecallers land on their call list, salespeople on their leads and site visits; other roles have no mobile screens yet. */
export default function Index() {
  const { user, apiUrl } = useUser();
  const { signOut } = useSession();
  if (user.role.key === 'telecaller') return <WorklistScreen />;
  if (user.role.key === 'sales') return <SalesHomeScreen />;
  return <HomeScreen user={user} apiUrl={apiUrl} onLogout={signOut} />;
}

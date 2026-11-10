import { HomeScreen } from '../screens/HomeScreen';
import { WorklistScreen } from '../screens/WorklistScreen';
import { useSession, useUser } from '../session';

/** Telecallers land on their worklist; other roles have no mobile screens yet. */
export default function Index() {
  const { user, apiUrl } = useUser();
  const { signOut } = useSession();
  return user.role.key === 'telecaller' ? <WorklistScreen /> : <HomeScreen user={user} apiUrl={apiUrl} onLogout={signOut} />;
}

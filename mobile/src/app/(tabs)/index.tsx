import { appRole } from '../../lib/tabs';
import { AdminHomeScreen } from '../../screens/AdminHomeScreen';
import { HomeScreen } from '../../screens/HomeScreen';
import { SalesHomeScreen } from '../../screens/SalesHomeScreen';
import { TelecallerHomeScreen } from '../../screens/TelecallerHomeScreen';
import { useUser } from '../../session';

/** Home: each role's dashboard (admin: the team's). Other roles have no phone screens yet. */
export default function HomeTab() {
  const { user, apiUrl } = useUser();
  const role = appRole(user.role.key);
  if (role === 'telecaller') return <TelecallerHomeScreen />;
  if (role === 'sales') return <SalesHomeScreen />;
  if (role === 'admin') return <AdminHomeScreen />;
  return <HomeScreen user={user} apiUrl={apiUrl} />;
}

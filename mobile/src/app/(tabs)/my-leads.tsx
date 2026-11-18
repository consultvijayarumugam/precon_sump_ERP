import { appRole } from '../../lib/tabs';
import { SalesLeadsScreen } from '../../screens/SalesLeadsScreen';
import { WorklistScreen } from '../../screens/WorklistScreen';
import { useUser } from '../../session';

/** My Leads: the telecaller's call list, or the salesperson's handed-over leads. */
export default function MyLeadsTab() {
  const { user } = useUser();
  return appRole(user.role.key) === 'telecaller' ? <WorklistScreen /> : <SalesLeadsScreen />;
}

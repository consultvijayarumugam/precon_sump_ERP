import { useLocalSearchParams } from 'expo-router';
import { AllLeadsScreen } from '../screens/AllLeadsScreen';

export default function LeadsRoute() {
  const { stageId, status, title, assignedToId } = useLocalSearchParams<{ stageId?: string; status?: string; title?: string; assignedToId?: string }>();
  return <AllLeadsScreen stageId={stageId} status={status} title={title} assignedToId={assignedToId} />;
}

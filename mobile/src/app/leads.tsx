import { useLocalSearchParams } from 'expo-router';
import { AllLeadsScreen } from '../screens/AllLeadsScreen';

export default function LeadsRoute() {
  const { stageId, status, title } = useLocalSearchParams<{ stageId?: string; status?: string; title?: string }>();
  return <AllLeadsScreen stageId={stageId} status={status} title={title} />;
}

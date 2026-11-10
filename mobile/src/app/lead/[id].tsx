import { useLocalSearchParams } from 'expo-router';
import { LeadScreen } from '../../screens/LeadScreen';

export default function LeadRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <LeadScreen id={id} />;
}

import { Pressable, StyleSheet, Text } from 'react-native';
import { Button, Centered } from '../components/ui';
import { useSession } from '../session';
import { colors } from '../theme';

/** The saved login couldn't be checked because the server is unreachable. */
export default function Offline() {
  const { state, retry, signOut } = useSession();
  return (
    <Centered>
      <Text style={styles.message}>{state.status === 'offline' ? state.message : ''}</Text>
      <Button label="Try again" onPress={() => void retry()} style={styles.retry} />
      <Pressable style={styles.logout} onPress={() => void signOut()} accessibilityRole="button">
        <Text style={styles.logoutText}>Log out</Text>
      </Pressable>
    </Centered>
  );
}

const styles = StyleSheet.create({
  message: { fontSize: 16, color: colors.ink, textAlign: 'center', marginBottom: 20 },
  retry: { paddingHorizontal: 32 },
  logout: { minHeight: 48, justifyContent: 'center', marginTop: 8, paddingHorizontal: 16 },
  logoutText: { color: colors.blue, fontSize: 15, fontWeight: '600' },
});

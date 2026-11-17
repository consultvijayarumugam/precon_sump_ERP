import { useRouter } from 'expo-router';
import { StyleSheet, Text } from 'react-native';
import { useSession, useUser } from '../session';
import { colors } from '../theme';
import { Button, Sheet } from './ui';

/** Who's logged in, the server, call tracking and log out. Shared by the telecaller and sales home screens. */
export function AccountSheet({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { user, apiUrl } = useUser();
  const { signOut } = useSession();
  return (
    <Sheet title={`${user.fullName} (${user.role.name})`} onClose={onClose}>
      <Text style={styles.details}>{user.email}</Text>
      <Text style={styles.details}>Server: {apiUrl}</Text>
      <Button
        testID="call-tracking"
        label="Call tracking"
        tone="secondary"
        icon="timer-outline"
        style={styles.button}
        onPress={() => {
          onClose();
          router.push('/call-tracking');
        }}
      />
      <Button testID="logout" label="Log out" tone="secondary" icon="log-out-outline" style={styles.button} onPress={() => void signOut()} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  details: { fontSize: 13, color: colors.ink3, marginTop: 3 },
  button: { marginTop: 16, marginBottom: 4 },
});

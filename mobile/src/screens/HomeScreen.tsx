import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { User } from '../api';
import { PeriodReportCard } from '../components/period-report-card';
import { colors } from '../theme';

/** Home for roles with no phone screens yet (e.g. factory supervisor). Log out is in More, as for everyone. */
export function HomeScreen({ user, apiUrl }: { user: User; apiUrl: string }) {
  return (
    <SafeAreaView style={styles.page} edges={['top']}>
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.brand}>
          Precon <Text style={styles.brandAccent}>Sump</Text>
        </Text>
        <View style={styles.card}>
          <Text testID="logged-in" style={styles.title}>
            Logged in as {user.fullName} ({user.role.name})
          </Text>
          <Text style={styles.detail}>{user.email}</Text>
          <Text style={styles.detail}>Server: {apiUrl}</Text>
        </View>
        {/* Admins (leads.read_all) see the team's results; others with leads.read their own. */}
        {user.permissions?.includes('leads.read') && (
          <View style={styles.report}>
            <PeriodReportCard title={user.permissions.includes('leads.read_all') ? 'Team results' : 'My results'} />
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.surface },
  body: { flexGrow: 1, justifyContent: 'center', padding: 20 },
  report: { marginHorizontal: -12, marginTop: 8 },
  brand: { fontSize: 32, fontWeight: '700', color: colors.navy900, textAlign: 'center', marginBottom: 24 },
  brandAccent: { color: colors.blue },
  card: { backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.line, padding: 20 },
  title: { fontSize: 20, fontWeight: '700', color: colors.ink },
  detail: { marginTop: 6, fontSize: 14, color: colors.ink3 },
});

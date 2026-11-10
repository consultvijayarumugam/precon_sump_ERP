import { LoginScreen } from '../screens/LoginScreen';
import { useSession } from '../session';

export default function Login() {
  const { state, signedIn } = useSession();
  if (state.status !== 'out') return null; // the splash screen covers the launch check
  return <LoginScreen apiUrl={state.apiUrl} notice={state.notice} onLoggedIn={signedIn} />;
}

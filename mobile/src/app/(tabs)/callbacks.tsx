import { FollowUpsScreen } from '../../screens/FollowUpsScreen';

/** Callbacks (telecaller tab): overdue, upcoming and done. The calendar is its own tab. */
export default function CallbacksTab() {
  return <FollowUpsScreen calendarLink={false} />;
}

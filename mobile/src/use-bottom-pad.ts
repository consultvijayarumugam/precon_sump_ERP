import { BottomTabBarHeightContext } from 'expo-router/js-tabs';
import { useContext } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Space to leave under a scrolling list. Inside a tab the tab bar already sits
 * above the phone's navigation bar; on a full screen the list must clear it.
 */
export function useBottomPad(extra = 16) {
  const insets = useSafeAreaInsets();
  const inTabs = useContext(BottomTabBarHeightContext) !== undefined;
  return inTabs ? extra : insets.bottom + extra;
}

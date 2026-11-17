import * as Location from 'expo-location';

export interface Reading {
  latitude: number;
  longitude: number;
  accuracyMeters: number | undefined;
}

/** Thrown with words a salesperson can act on; `settings` = only fixable in the phone's Settings. */
export class LocationProblem extends Error {
  constructor(
    message: string,
    readonly settings = false,
  ) {
    super(message);
  }
}

const TIMEOUT_MS = 25_000;
/** A reading this recent is still "where you are now" if a fresh one can't be had. */
const LAST_KNOWN_MAX_AGE_MS = 2 * 60_000;

const timeout = () =>
  new Promise<never>((_, reject) => setTimeout(() => reject(new LocationProblem('Could not get a GPS fix. Step outside or near a window and try again.')), TIMEOUT_MS));

/**
 * Precise first. If the phone's "Location Accuracy" prompt is declined (or the
 * fix fails), fall back to standard accuracy, then to a reading from the last
 * two minutes. Only then give up, in plain words.
 */
async function bestFix(): Promise<Location.LocationObject> {
  try {
    return await Promise.race([Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }), timeout()]);
  } catch {
    try {
      return await Promise.race([Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }), timeout()]);
    } catch {
      const last = await Location.getLastKnownPositionAsync({ maxAge: LAST_KNOWN_MAX_AGE_MS }).catch(() => null);
      if (last) return last;
      throw new LocationProblem('Could not get your location. Tap "I\'m at site" again, and choose "Turn on" if the phone asks to improve location accuracy.');
    }
  }
}

/**
 * One GPS reading, taken now, while the app is open. Nothing runs in the
 * background and nothing is tracked afterwards (CLAUDE.md: point-in-time only).
 */
export async function readLocationOnce(): Promise<Reading> {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (!permission.granted) {
    throw permission.canAskAgain
      ? new LocationProblem('Allow location so the visit can be recorded where you are.')
      : new LocationProblem('Location is blocked for Precon Sump. Open Settings → Permissions → Location → Allow only while using the app.', true);
  }
  if (!(await Location.hasServicesEnabledAsync())) {
    throw new LocationProblem('Location (GPS) is off on this phone. Turn it on from the quick settings, then try again.');
  }
  const position = await bestFix();
  const accuracy = position.coords.accuracy;
  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracyMeters: accuracy === null || accuracy === undefined ? undefined : Math.round(accuracy),
  };
}

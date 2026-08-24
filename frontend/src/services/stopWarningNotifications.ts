// Fires a local notification when a stop-countdown enters its final warning
// window (see STOP_WARNING_MS in flightRecording.ts), so a pilot with the
// phone locked/stowed away still gets a chance to prevent an unwanted
// auto-stop — not just someone actively watching the in-app popup.
//
// Two ways to act on it, deliberately layered:
//   1. A "Keep Recording" action button, handled directly from the
//      notification response listener — convenient, but there's a known,
//      currently-open Expo issue (expo/expo#36282) where action-button
//      responses aren't always delivered while the app is backgrounded or
//      killed on some devices. Not something to rely on alone.
//   2. Tapping the notification body itself (not the button) opens the
//      app — at which point the already-verified in-app popup takes over,
//      showing the live countdown with its own "Keep Recording" button.
//      This path has none of the background-delivery uncertainty above,
//      since by the time it matters the app is genuinely in the foreground.
import * as Notifications from 'expo-notifications';
import { resetStopCountdown } from './flightRecording';

const CATEGORY_ID = 'pushpakwx-stop-warning';
const KEEP_RECORDING_ACTION = 'keep-recording';

let categoryReady: Promise<void> | null = null;

async function ensureCategory(): Promise<void> {
  if (!categoryReady) {
    categoryReady = Notifications.setNotificationCategoryAsync(CATEGORY_ID, [
      {
        identifier: KEEP_RECORDING_ACTION,
        buttonTitle: 'Keep Recording',
        options: { opensAppToForeground: false },
      },
    ]).then(() => undefined);
  }
  return categoryReady;
}

// Notifications while the app IS in the foreground still show as a banner —
// useful here, since someone could be foregrounded on a different tab (not
// InFlight) when a countdown enters its warning window.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function ensureNotificationPermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

// Fired when a recording auto-starts with nobody in the foreground to see
// it happen (background task detected the crossing — see
// backgroundLocationTask.ts and beginRecording() now being callable from
// there). Without this, a pilot who stowed the phone before takeoff had no
// way to know recording had actually started until reopening the app.
export async function presentAutoStartNotification(): Promise<void> {
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Flight recording started',
        body: 'PushpakWx detected takeoff and started recording automatically.',
      },
      trigger: null,
    });
  } catch (e) {
    console.warn('[flight-recording] could not present auto-start notification', (e as Error)?.message);
  }
}

export async function presentStopWarningNotification(secondsLeft: number): Promise<void> {
  try {
    await ensureCategory();
    const minutes = Math.ceil(secondsLeft / 60);
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Recording will stop soon',
        body: `No movement detected. Tap "Keep Recording", or open the app within ${minutes} minute${minutes === 1 ? '' : 's'} to keep it going.`,
        categoryIdentifier: CATEGORY_ID,
      },
      trigger: null, // fire immediately
    });
  } catch (e) {
    // Notification permission may not have been granted — the in-app
    // popup (already visible whenever the app happens to be foregrounded)
    // still covers that case regardless of whether this succeeds.
    console.warn('[flight-recording] could not present stop-warning notification', (e as Error)?.message);
  }
}

// Registered once at app startup (see app/_layout.tsx) so it's available
// even if the OS relaunches a lightweight JS context to service the
// response, the same reasoning as the background location task itself.
Notifications.addNotificationResponseReceivedListener((response) => {
  if (response.actionIdentifier === KEEP_RECORDING_ACTION) {
    resetStopCountdown().catch(() => {});
  }
  // Any other interaction (tapping the notification body) just opens the
  // app by default — no extra handling needed, the in-app popup covers it.
});

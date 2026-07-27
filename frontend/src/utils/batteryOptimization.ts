// Prompts to exempt PushpakWx from Android's battery optimization —
// directly relevant to the sample-rate gaps found in real flight data
// (position kept updating correctly while GPS altitude froze for long
// stretches, a known symptom of aggressive background throttling on
// manufacturer Android skins). A properly configured foreground service
// helps, but doesn't fully protect against every manufacturer's own
// extra battery management layered on top of stock Android.
//
// Uses the direct one-tap system dialog (REQUEST_IGNORE_BATTERY_
// OPTIMIZATIONS) rather than just opening the general settings list —
// meaningfully better odds a pilot actually enables it mid-preflight,
// at the cost of being a more scrutinized request under Google Play
// policy than the general-settings-list alternative. Continuous
// background GPS recording is a legitimate, in-policy use case for this
// exemption (the same category navigation and fitness-tracking apps
// rely on) — worth revisiting specifically before an eventual Play
// Store submission, not something to treat as settled forever.
import { Platform } from 'react-native';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Application from 'expo-application';
import { storage } from '@/src/utils/storage';

const KEY_BATTERY_PROMPTED = 'battery_optimization_prompted';

export async function hasPromptedBatteryOptimization(): Promise<boolean> {
  return (await storage.getItem<boolean>(KEY_BATTERY_PROMPTED, false)) ?? false;
}

export async function markBatteryOptimizationPrompted(): Promise<void> {
  await storage.setItem(KEY_BATTERY_PROMPTED, true);
}

export async function requestBatteryOptimizationExemption(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    const packageName = Application.applicationId;
    if (!packageName) return;
    await IntentLauncher.startActivityAsync(
      IntentLauncher.ActivityAction.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
      { data: `package:${packageName}` },
    );
  } catch (e) {
    // Some OEM Android builds restrict or reshape this intent — a failed
    // attempt shouldn't block starting the actual recording.
    console.warn('[flight-recording] battery optimization prompt failed', (e as Error)?.message);
  }
}

import React from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { colors, spacing, radius } from '@/src/theme';

const LAST_UPDATED = 'July 23, 2026';
const SUPPORT_EMAIL = 'mahesho.develop@gmail.com';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionCard}>
        <Text style={styles.body}>{children}</Text>
      </View>
    </View>
  );
}

export default function Privacy() {
  const router = useRouter();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }} edges={['top']} testID="privacy-screen">
      <View style={styles.header}>
        <Pressable testID="privacy-back-button" onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>Privacy Policy</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xxl }}>
        <Text style={styles.updated}>Last updated: {LAST_UPDATED}</Text>

        <View style={styles.section}>
          <View style={styles.sectionCard}>
            <Text style={styles.body}>
              PushpakWx ("the app," "the service," "we," "us") is an aviation weather and flight
              logbook tool built for student pilots and flight training. This policy explains what
              information the service collects, how it's used, and what choices you have.
              {'\n\n'}
              PushpakWx is currently operated by its developer directly, rather than through a
              registered company. If that changes, this policy will be updated to reflect the
              operating entity.
            </Text>
          </View>
        </View>

        <Section title="1. INFORMATION WE COLLECT">
          <Text style={styles.bold}>Account information </Text>
          your email address, a one-way hashed password (we never store or can see your actual
          password), and optionally your full name.
          {'\n\n'}
          <Text style={styles.bold}>Location and flight data </Text>
          coordinates or airport codes when you check weather; a detailed GPS track (latitude,
          longitude, altitude, speed, heading) when you record a flight, saved as part of your
          logbook; aircraft type, registration, your role (PIC, dual, or co-pilot), instrument
          time, and any notes you add. Day/night flight time is calculated automatically from your
          flight's actual GPS track and timing.
          {'\n\n'}
          <Text style={styles.bold}>Usage information </Text>
          sign-ins, registrations, and weather lookups tied to your account. Weather lookups made
          while signed out are not tied to any account.
          {'\n\n'}
          <Text style={styles.bold}>Device sensor data </Text>
          while recording a flight, the app reads your device's compass and GPS to display
          heading, altitude, and speed, smoothed for display and stored only as part of the flight
          record you choose to save.
          {'\n\n'}
          <Text style={styles.bold}>What we don't collect </Text>
          no payment information (the app is currently free), and no access to your contacts,
          photos, or other apps.
        </Section>

        <Section title="2. HOW WE USE YOUR INFORMATION">
          We use the information above to provide weather data, flight tracking, and your
          logbook; authenticate you and keep your account secure; generate DGCA/FAA-format
          logbook exports on request; understand usage patterns; and send account-related emails.
          {'\n\n'}
          We do not sell your data, and we do not use it for advertising.
        </Section>

        <Section title="3. EMAILS WE SEND">
          We send emails only for account actions you initiate: verifying your email address,
          resetting your password, and confirming account deletion. These are sent through
          Resend, an email delivery service, which receives your email address and the email
          content solely to deliver these messages.
        </Section>

        <Section title="4. THIRD-PARTY SERVICES WE USE">
          To provide weather data, we send the coordinates or airport code you're looking up
          (not your account information) to Open-Meteo (forecasts), aviationweather.gov,
          operated by the U.S. National Weather Service (METAR/TAF), and wttr.in (backup source,
          used only if the above are unavailable).
          {'\n\n'}
          Our infrastructure is provided by MongoDB Atlas (database), Render (backend hosting),
          and Vercel (app and web hosting). Each provider processes data on our behalf under
          their own security and privacy practices.
        </Section>

        <Section title="5. HOW LONG WE KEEP YOUR DATA">
          Your account data, flight logs, and preferences are kept for as long as your account
          exists. Verification and reset codes are automatically deleted after use or expiry
          (typically within 5–15 minutes).
          {'\n\n'}
          If you delete your account, your flights, preferences, favorites, and account details
          are permanently removed. We retain a minimal record — your email address and the date
          of deletion — so a deletion request can be verified later if a dispute or support
          question arises, along with basic account-lifecycle history (that an account was
          created, signed in, and later deleted) stripped of the location-specific details of
          what was searched. No flight data, GPS tracks, or personal details are kept once an
          account is deleted.
        </Section>

        <Section title="6. DELETING YOUR ACCOUNT">
          You can permanently delete your account and data at any time from Settings. This
          requires three separate confirmations — your password, a typed acknowledgment, and a
          one-time code sent to your email — before anything is deleted, given how irreversible
          this action is. Once confirmed, your account cannot be recovered.
        </Section>

        <Section title="7. YOUR CHOICES">
          You can update your preferences at any time in Settings, request a password reset, or
          delete your account and data as described above. If you have questions about your data
          that aren't covered here, contact us at {SUPPORT_EMAIL}.
        </Section>

        <Section title="8. CHILDREN'S PRIVACY">
          PushpakWx is intended for use by student pilots and flight trainees, and is not
          directed at children under 13. If you believe a child has provided us with personal
          information, please contact us so we can remove it.
        </Section>

        <Section title="9. SECURITY">
          We use industry-standard practices to protect your data, including password hashing,
          encrypted connections, and account lockout after repeated failed login attempts. No
          service can guarantee absolute security, but we work to keep your information
          protected.
        </Section>

        <Section title="10. CHANGES TO THIS POLICY">
          We may update this policy as the service evolves. Material changes will be reflected
          here with an updated date. Continued use of the service after changes take effect
          means you accept the updated policy.
        </Section>

        <Section title="11. CONTACT">
          Questions about this policy or your data can be sent to {SUPPORT_EMAIL}.
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: { color: colors.onSurface, fontSize: 16, fontWeight: '700' },
  updated: { color: colors.onSurfaceTertiary, fontSize: 12, paddingHorizontal: spacing.lg, marginTop: spacing.md },
  section: { paddingHorizontal: spacing.lg, marginTop: spacing.md },
  sectionTitle: { color: colors.onSurfaceTertiary, fontSize: 11, letterSpacing: 2, marginBottom: spacing.sm, fontWeight: '700' },
  sectionCard: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  body: { color: colors.onSurfaceSecondary, fontSize: 13, lineHeight: 20 },
  bold: { color: colors.onSurface, fontWeight: '700' },
});

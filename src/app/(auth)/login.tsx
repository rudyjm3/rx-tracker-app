import { Link } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AuthHero } from '@/components/AuthHero';
import { GradientPressable } from '@/components/ui/gradient-pressable';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Brand, BorderRadius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/supabase/AuthProvider';

export default function LoginScreen() {
  const { signIn } = useAuth();
  const theme = useTheme();
  const styles = getStyles(theme);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setError(null);
    setSubmitting(true);
    const { error: signInError } = await signIn(email.trim(), password);
    setSubmitting(false);
    if (signInError) setError(signInError);
    // On success, the (auth) layout's session check redirects to (tabs).
  }

  return (
    <ThemedView style={styles.container}>
      <AuthHero title="Stay on track with every dose." tagline="Sign in to manage your medications and reminders." />
      <SafeAreaView edges={['bottom']} style={styles.safeArea}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.form}
        >

          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor={theme.textSecondary}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
          <TextInput
            style={styles.input}
            placeholder="Password"
            placeholderTextColor={theme.textSecondary}
            secureTextEntry
            autoComplete="password"
            value={password}
            onChangeText={setPassword}
          />

          {error && (
            <ThemedText themeColor="text" style={styles.error}>
              {error}
            </ThemedText>
          )}

          <GradientPressable
            style={[styles.button, submitting && styles.buttonDisabled]}
            onPress={handleSubmit}
            disabled={submitting || !email || !password}
          >
            {submitting ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <ThemedText style={styles.buttonText}>Sign in</ThemedText>
            )}
          </GradientPressable>

          <Link href="/(auth)/signup" style={styles.link}>
            <ThemedText type="linkPrimary">Need an account? Sign up</ThemedText>
          </Link>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ThemedView>
  );
}

function getStyles(theme: ReturnType<typeof useTheme>) {
  return StyleSheet.create({
    container: { flex: 1 },
    safeArea: { flex: 1, justifyContent: 'center' },
    form: { paddingHorizontal: Spacing.four, gap: Spacing.two },
    input: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: BorderRadius.sm,
      paddingHorizontal: Spacing.three,
      paddingVertical: Spacing.two,
      fontSize: 16,
      color: theme.text,
      backgroundColor: theme.backgroundElement,
    },
    error: { color: Brand.danger },
    button: {
      backgroundColor: Brand.deepBlue,
      borderRadius: BorderRadius.sm,
      paddingVertical: Spacing.three,
      alignItems: 'center',
      marginTop: Spacing.two,
    },
    buttonDisabled: { opacity: 0.6 },
    buttonText: { color: '#ffffff', fontWeight: '600' },
    link: { marginTop: Spacing.three, alignSelf: 'center' },
  });
}

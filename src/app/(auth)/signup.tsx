import { Link } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Brand, BorderRadius, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/supabase/AuthProvider';

export default function SignupScreen() {
  const { signUp } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setError(null);
    setSubmitting(true);
    const { error: signUpError } = await signUp(email.trim(), password);
    setSubmitting(false);
    if (signUpError) {
      setError(signUpError);
      return;
    }
    // Supabase sends a confirmation email by default; there's no session
    // yet, so tell the user to check their inbox rather than expecting a
    // redirect into (tabs).
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <ThemedText type="subtitle" style={styles.confirmTitle}>
            Check your email
          </ThemedText>
          <ThemedText style={styles.confirmBody}>
            We sent a confirmation link to {email}. Confirm your address, then sign in.
          </ThemedText>
          <Link href="/(auth)/login" style={styles.link}>
            <ThemedText type="linkPrimary">Back to sign in</ThemedText>
          </Link>
        </SafeAreaView>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.form}
        >
          <ThemedText type="title" style={styles.title}>
            RxTracker
          </ThemedText>
          <ThemedText type="subtitle" style={styles.subtitle}>
            Create an account
          </ThemedText>

          <TextInput
            style={styles.input}
            placeholder="Email"
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
          <TextInput
            style={styles.input}
            placeholder="Password"
            secureTextEntry
            autoComplete="password-new"
            value={password}
            onChangeText={setPassword}
          />

          {error && <ThemedText style={styles.error}>{error}</ThemedText>}

          <Pressable
            style={[styles.button, submitting && styles.buttonDisabled]}
            onPress={handleSubmit}
            disabled={submitting || !email || !password}
          >
            {submitting ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <ThemedText style={styles.buttonText}>Sign up</ThemedText>
            )}
          </Pressable>

          <Link href="/(auth)/login" style={styles.link}>
            <ThemedText type="linkPrimary">Already have an account? Sign in</ThemedText>
          </Link>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, justifyContent: 'center', paddingHorizontal: Spacing.four, gap: Spacing.two },
  form: { gap: Spacing.two },
  title: { fontSize: 32, lineHeight: 38, marginBottom: Spacing.one },
  subtitle: { fontSize: 18, lineHeight: 24, marginBottom: Spacing.three },
  confirmTitle: { fontSize: 18, lineHeight: 24, marginBottom: Spacing.two },
  confirmBody: { marginBottom: Spacing.three },
  input: {
    borderWidth: 1,
    borderColor: Brand.border,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 16,
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

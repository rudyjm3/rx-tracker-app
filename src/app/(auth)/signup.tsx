import { Link } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { AuthShell } from '@/components/auth-shell';
import { LegalLinks } from '@/components/legal-links';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { Field } from '@/components/ui/field';
import { Text } from '@/components/ui/text';
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
      <AuthShell>
        <Text className="text-center text-[26.4px] font-extrabold text-brand-navy dark:text-white">Check your email</Text>
        <Text muted className="mb-6 mt-2 text-center text-sm">
          We sent a confirmation link to {email}. Confirm your address, then{' '}
          <Link href="/(auth)/login" className="font-bold text-brand-blue">
            sign in
          </Link>
          .
        </Text>
        <Link href="/(auth)/login" className="text-center text-sm font-bold text-brand-blue">
          Back to sign in
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <Text className="text-center text-[26.4px] font-extrabold text-brand-navy dark:text-white">Create your account</Text>
      <Text muted className="mb-8 mt-2 text-center text-sm">
        Start tracking your medications in minutes.
      </Text>

      {error ? <Callout kind="error" className="mb-4">{error}</Callout> : null}

      <View className="gap-4">
        <Field
          size="auth"
          label="Email"
          icon="mail-outline"
          placeholder="you@example.com"
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
        <Field
          size="auth"
          label="Password"
          icon="lock-closed-outline"
          placeholder="Create a password"
          secureTextEntry
          autoComplete="password-new"
          value={password}
          onChangeText={setPassword}
        />
        <Button
          label={submitting ? 'Creating account…' : 'Create account'}
          loading={submitting}
          disabled={!email || !password}
          onPress={handleSubmit}
          className="mt-2 w-full"
        />
      </View>

      <Text muted className="mt-6 text-center text-sm">
        Already have an account?{' '}
        <Link href="/(auth)/login" className="font-bold text-brand-blue">
          Sign in
        </Link>
      </Text>
      <LegalLinks />
    </AuthShell>
  );
}

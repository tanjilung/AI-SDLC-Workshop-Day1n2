'use client';

import {
  startAuthentication,
  startRegistration,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON
} from '@simplewebauthn/browser';
import type { Route } from 'next';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

type AuthError = string | null;

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [error, setError] = useState<AuthError>(null);
  const [loading, setLoading] = useState(false);

  function getRedirectTarget(): Route {
    const searchParams = typeof window === 'undefined' ? null : new URL(window.location.href).searchParams;
    const redirectTarget = searchParams ? searchParams.get('redirect') : null;
    return redirectTarget && redirectTarget.startsWith('/') ? (redirectTarget as Route) : '/';
  }

  useEffect(() => {
    let cancelled = false;

    async function checkSession() {
      const response = await fetch('/api/auth/me');
      if (!cancelled && response.ok) {
        router.replace('/');
      }
    }

    void checkSession();

    return () => {
      cancelled = true;
    };
  }, [router]);

  async function handleRegister() {
    setLoading(true);
    setError(null);

    try {
      const optionsResponse = await fetch('/api/auth/register-options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username })
      });

      const optionsData = (await optionsResponse.json()) as { error?: string };
      if (!optionsResponse.ok) {
        setError(optionsData.error ?? 'Unable to start registration');
        return;
      }

      const attestation = await startRegistration({
        optionsJSON: optionsData as PublicKeyCredentialCreationOptionsJSON
      });

      const verifyResponse = await fetch('/api/auth/register-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, response: attestation })
      });

      const verifyPayload = (await verifyResponse.json()) as { error?: string };
      if (!verifyResponse.ok) {
        setError(verifyPayload.error ?? 'Unable to verify registration');
        return;
      }

      router.replace(getRedirectTarget());
    } catch (thrown) {
      setError(thrown instanceof Error ? thrown.message : 'Registration failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleLogin() {
    setLoading(true);
    setError(null);

    try {
      const optionsResponse = await fetch('/api/auth/login-options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username })
      });

      const optionsData = (await optionsResponse.json()) as { error?: string };
      if (!optionsResponse.ok) {
        setError(optionsData.error ?? 'Unable to start login');
        return;
      }

      const assertion = await startAuthentication({
        optionsJSON: optionsData as PublicKeyCredentialRequestOptionsJSON
      });

      const verifyResponse = await fetch('/api/auth/login-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, response: assertion })
      });

      const verifyPayload = (await verifyResponse.json()) as { error?: string };
      if (!verifyResponse.ok) {
        setError(verifyPayload.error ?? 'Unable to verify login');
        return;
      }

      router.replace(getRedirectTarget());
    } catch (thrown) {
      setError(thrown instanceof Error ? thrown.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-slate-100">
      <div className="w-full max-w-lg space-y-6 rounded-2xl border border-slate-800 bg-slate-900/80 p-8 shadow-xl">
        <div className="space-y-2">
          <p className="text-sm uppercase tracking-[0.25em] text-sky-300">
            Login
          </p>
          <h1 className="text-3xl font-semibold">Sign in with a passkey</h1>
          <p className="text-slate-300">
            Use your username with a platform authenticator or security key.
          </p>
        </div>

        <label className="block space-y-2">
          <span className="text-sm text-slate-300">Username</span>
          <input
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 outline-none ring-0 placeholder:text-slate-500 focus:border-sky-400"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="alice"
            autoComplete="username webauthn"
          />
        </label>

        {error ? (
          <p role="alert" className="rounded-lg border border-rose-900 bg-rose-950/60 px-3 py-2 text-sm text-rose-200">
            {error}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            disabled={loading}
            onClick={handleRegister}
            className="rounded-lg bg-sky-500 px-4 py-2 font-medium text-white transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Register
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={handleLogin}
            className="rounded-lg border border-slate-700 px-4 py-2 font-medium text-slate-100 transition hover:border-slate-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Login
          </button>
        </div>
      </div>
    </main>
  );
}

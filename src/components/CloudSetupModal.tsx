import { Check, Copy, LogOut, RotateCcw, Server, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import type { ServerCalendarCapabilities } from '../../server/calendarService';
import type { BookingMode } from '../lib/bookingApi';

interface CloudSetupModalProps {
  open: boolean;
  onClose: () => void;
  mode: BookingMode;
  onModeChange: (mode: BookingMode) => void;
  capabilities: ServerCalendarCapabilities | null;
  googleUser: User | null;
  hasToken: boolean;
  isSigningIn: boolean;
  authError: string | null;
  onGoogleSignIn: () => void;
  onGoogleSignOut: () => void;
  onResetMock: () => void;
}

const CLOUD_RUN_SNIPPET = `gcloud run deploy crown-and-clipper \\
  --source . \\
  --region australia-southeast1 \\
  --platform managed \\
  --allow-unauthenticated \\
  --set-env-vars "NODE_ENV=production,BOOKING_MODE=live,TZ=Australia/Sydney,GOOGLE_CALENDAR_ID=primary" \\
  --set-secrets "GOOGLE_SERVICE_ACCOUNT_JSON=google-service-account-json:latest"`;

export function CloudSetupModal({
  open,
  onClose,
  mode,
  onModeChange,
  capabilities,
  googleUser,
  hasToken,
  isSigningIn,
  authError,
  onGoogleSignIn,
  onGoogleSignOut,
  onResetMock,
}: CloudSetupModalProps) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const handleCopyCommand = async () => {
    try {
      await navigator.clipboard.writeText(CLOUD_RUN_SNIPPET);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked in restricted frame
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-xs p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cloud-setup-title"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-2xl max-h-[90vh] overflow-y-auto bg-white rounded-t-3xl sm:rounded-2xl border border-stone-200 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sm:hidden w-10 h-1.5 bg-stone-300 rounded-full mx-auto mt-3" />

        <div className="sticky top-0 bg-white/95 backdrop-blur-sm border-b border-stone-200 px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <Server className="w-5 h-5 text-[#1E3A2F]" aria-hidden="true" />
            <h2 id="cloud-setup-title" className="font-display text-lg font-semibold text-stone-900">
              Barber Calendar &amp; Cloud Run Setup
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-stone-600 hover:text-stone-900 hover:bg-stone-100 transition-colors"
            aria-label="Close setup dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6 text-sm text-stone-700">
          {/* Calendar Source Mode */}
          <section className="space-y-3">
            <h3 className="font-semibold text-stone-900">1. Calendar Mode</h3>
            <div className="inline-flex items-center gap-1 p-1 bg-stone-100 rounded-xl">
              <button
                type="button"
                onClick={() => onModeChange('mock')}
                className={`min-h-[40px] px-4 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                  mode === 'mock'
                    ? 'bg-white text-stone-900 shadow-xs'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                Mock Mode (Demo)
              </button>
              <button
                type="button"
                onClick={() => onModeChange('live')}
                className={`min-h-[40px] px-4 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                  mode === 'live'
                    ? 'bg-white text-stone-900 shadow-xs'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                Live Google Calendar
              </button>
            </div>
            <p className="text-xs text-stone-500">
              {mode === 'mock'
                ? 'Mock Mode simulates realistic Sydney busy blocks in memory on the backend with full double-booking protection.'
                : 'Live Mode forwards requests through the backend to Google Calendar freeBusy & events APIs in Australia/Sydney time.'}
            </p>
            {mode === 'mock' && (
              <button
                type="button"
                onClick={onResetMock}
                className="inline-flex items-center gap-2 min-h-[40px] px-3.5 py-2 rounded-lg border border-stone-300 text-xs font-medium text-stone-700 hover:bg-stone-50 transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset Demo Busy Blocks</span>
              </button>
            )}
          </section>

          <hr className="border-stone-200" />

          {/* Google Calendar Sign-In */}
          <section className="space-y-3">
            <h3 className="font-semibold text-stone-900">
              2. Connect Barber Google Calendar (Preview &amp; Studio Admin)
            </h3>
            <p className="text-xs text-stone-600 leading-relaxed">
              Sign in with the barber&apos;s Google account to test live availability and event
              creation in this preview. Access tokens stay strictly in memory and are sent to our
              backend via Bearer headers—never saved to browser storage.
            </p>

            {capabilities?.hasServerCredentials && (
              <p className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl px-3.5 py-2.5">
                Server-side Cloud Run credentials ({capabilities.serverCredentialType}) are active.
                Public visitors can book directly without signing in.
              </p>
            )}

            {authError && (
              <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-3.5 py-2.5">
                {authError}
              </p>
            )}

            {hasToken && googleUser ? (
              <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl border border-stone-200 bg-stone-50">
                <div>
                  <p className="font-medium text-stone-900">
                    Connected as {googleUser.displayName || googleUser.email}
                  </p>
                  <p className="text-xs text-stone-500">
                    {googleUser.email} · Calendar events &amp; free/busy enabled
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onGoogleSignOut}
                  className="min-h-[40px] inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-stone-300 bg-white text-xs font-medium text-stone-700 hover:bg-stone-100 transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Disconnect</span>
                </button>
              </div>
            ) : (
              <div>
                <button
                  type="button"
                  disabled={isSigningIn}
                  onClick={onGoogleSignIn}
                  className="gsi-material-button"
                >
                  <div className="gsi-material-button-state" />
                  <div className="gsi-material-button-content-wrapper">
                    <div className="gsi-material-button-icon">
                      <svg
                        version="1.1"
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 48 48"
                        style={{ display: 'block' }}
                      >
                        <path
                          fill="#EA4335"
                          d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                        />
                        <path
                          fill="#4285F4"
                          d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                        />
                        <path
                          fill="#FBBC05"
                          d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                        />
                        <path
                          fill="#34A853"
                          d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                        />
                        <path fill="none" d="M0 0h48v48H0z" />
                      </svg>
                    </div>
                    <span className="gsi-material-button-contents">
                      {isSigningIn ? 'Connecting Google Calendar...' : 'Sign in with Google'}
                    </span>
                    <span style={{ display: 'none' }}>Sign in with Google</span>
                  </div>
                </button>
              </div>
            )}
          </section>

          <hr className="border-stone-200" />

          {/* Cloud Run Deployment */}
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-semibold text-stone-900">
                3. Deploy to Google Cloud Run (australia-southeast1)
              </h3>
              <button
                type="button"
                onClick={handleCopyCommand}
                className="min-h-[36px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-stone-200 text-xs font-medium text-stone-700 hover:bg-stone-50 transition-colors"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-700" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied' : 'Copy Command'}</span>
              </button>
            </div>
            <p className="text-xs text-stone-600 leading-relaxed">
              For public Instagram &amp; TikTok traffic, deploy the Express backend to Sydney
              (<code className="font-mono">australia-southeast1</code>) with a Service Account JSON
              or OAuth Refresh Token stored in Secret Manager. See{' '}
              <code className="font-mono">DEPLOYMENT.md</code> and{' '}
              <code className="font-mono">.env.example</code> for complete instructions.
            </p>
            <pre className="p-3.5 rounded-xl bg-stone-950 text-stone-100 text-xs font-mono overflow-x-auto leading-relaxed">
              {CLOUD_RUN_SNIPPET}
            </pre>
          </section>
        </div>
      </div>
    </div>
  );
}

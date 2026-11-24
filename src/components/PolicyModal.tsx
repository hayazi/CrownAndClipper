import { X } from 'lucide-react';
import { useEffect } from 'react';
import { STUDIO_INFO } from '../../shared/services';

export type PolicyTab = 'terms' | 'privacy';

interface PolicyModalProps {
  open: boolean;
  activeTab: PolicyTab;
  onTabChange: (tab: PolicyTab) => void;
  onClose: () => void;
}

export function PolicyModal({
  open,
  activeTab,
  onTabChange,
  onClose,
}: PolicyModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-xs p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="policy-modal-title"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-xl max-h-[88vh] overflow-y-auto bg-white rounded-t-3xl sm:rounded-2xl border border-stone-200 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sm:hidden w-10 h-1.5 bg-stone-300 rounded-full mx-auto mt-3" />
        <div className="sticky top-0 bg-white/95 backdrop-blur-sm border-b border-stone-200 px-6 py-4 flex items-center justify-between gap-4">
          <h2 id="policy-modal-title" className="font-display text-lg font-semibold text-stone-900">
            Studio Policies &amp; Privacy
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-stone-600 hover:text-stone-900 hover:bg-stone-100 transition-colors"
            aria-label="Close policy dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 pt-4">
          <div className="inline-flex items-center gap-1 p-1 bg-stone-100 rounded-xl">
            <button
              type="button"
              onClick={() => onTabChange('terms')}
              className={`min-h-[40px] px-4 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'terms'
                  ? 'bg-white text-stone-900 shadow-xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              Booking &amp; Cancellation
            </button>
            <button
              type="button"
              onClick={() => onTabChange('privacy')}
              className={`min-h-[40px] px-4 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'privacy'
                  ? 'bg-white text-stone-900 shadow-xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              APP Privacy Policy
            </button>
          </div>
        </div>

        <div className="p-6 space-y-5 text-sm leading-relaxed text-stone-700">
          {activeTab === 'terms' ? (
            <>
              <div>
                <h3 className="font-semibold text-stone-900 mb-1">
                  No Deposit Required
                </h3>
                <p>
                  Standard cuts and beard services do not require upfront payment. Pay in studio
                  after your cut via card, Apple Pay, or cash.
                </p>
              </div>
              <div>
                <h3 className="font-semibold text-stone-900 mb-1">
                  {STUDIO_INFO.cancellationWindowHours}-Hour Free Reschedule &amp; Cancellation
                </h3>
                <p>
                  Plans change. Let us know at least {STUDIO_INFO.cancellationWindowHours} hours
                  before your scheduled {STUDIO_INFO.timezone} time by texting or messaging{' '}
                  <span className="font-medium text-stone-900">{STUDIO_INFO.instagramHandle}</span>{' '}
                  so we can open the chair for someone else.
                </p>
              </div>
              <div>
                <h3 className="font-semibold text-stone-900 mb-1">
                  {STUDIO_INFO.gracePeriodMinutes}-Minute Arrival Grace Period
                </h3>
                <p>
                  We hold every seat for {STUDIO_INFO.gracePeriodMinutes} minutes. If you are
                  delayed on Sydney Trains or Crown Street traffic, send a quick text—if time
                  allows we will adjust your cut, or reschedule cleanly.
                </p>
              </div>
              <div>
                <h3 className="font-semibold text-stone-900 mb-1">
                  Late Cancellations &amp; No-Shows
                </h3>
                <p>
                  First-time late cancellations are always waived with a friendly reminder.
                  Repeated missed bookings without notice may require a small refundable holding
                  deposit on future slots.
                </p>
              </div>
            </>
          ) : (
            <>
              <div>
                <h3 className="font-semibold text-stone-900 mb-1">
                  Australian Privacy Principles (APP) Commitment
                </h3>
                <p>
                  {STUDIO_INFO.brandName} handles personal information in accordance with the{' '}
                  <em>Privacy Act 1988 (Cth)</em> and the Australian Privacy Principles (APPs).
                </p>
              </div>
              <div>
                <h3 className="font-semibold text-stone-900 mb-1">
                  Strict Data Minimization (APP 3)
                </h3>
                <p>
                  We collect only what is strictly necessary to reserve your chair: your name,
                  Australian mobile number, chosen service, and appointment time. We do not collect
                  your email address, home address, or date of birth, and we do not run third-party
                  ad trackers on this booking page.
                </p>
              </div>
              <div>
                <h3 className="font-semibold text-stone-900 mb-1">
                  Purpose &amp; Disclosure (APP 5 &amp; APP 6)
                </h3>
                <p>
                  Your details are recorded directly in the studio&apos;s Google Calendar event
                  solely to confirm your booking, prevent double bookings, and contact you by SMS
                  or call if your appointment time needs attention. We never sell, rent, or share
                  your mobile number for marketing.
                </p>
              </div>
              <div>
                <h3 className="font-semibold text-stone-900 mb-1">
                  Security, Access &amp; Deletion (APP 11, 12 &amp; 13)
                </h3>
                <p>
                  All requests are encrypted over HTTPS and processed on our backend server. You may
                  request access to, correction of, or deletion of your appointment record at any
                  time by messaging{' '}
                  <span className="font-medium text-stone-900">{STUDIO_INFO.instagramHandle}</span>.
                </p>
              </div>
            </>
          )}
        </div>

        <div className="px-6 py-4 border-t border-stone-200 bg-stone-50 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] px-5 py-2.5 rounded-xl bg-stone-900 text-white text-sm font-medium hover:bg-stone-800 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

import { CalendarCheck2, Loader2, X } from 'lucide-react';
import { useEffect } from 'react';
import { STUDIO_INFO, type BarberService } from '../../shared/services';
import type { BookingMode } from '../lib/bookingApi';

interface BookingConfirmModalProps {
  open: boolean;
  service: BarberService;
  dateLabel: string;
  timeLabel: string;
  customerName: string;
  customerPhone: string;
  mode: BookingMode;
  submitting: boolean;
  showPrice: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function BookingConfirmModal({
  open,
  service,
  dateLabel,
  timeLabel,
  customerName,
  customerPhone,
  mode,
  submitting,
  showPrice,
  onCancel,
  onConfirm,
}: BookingConfirmModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) onCancel();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, submitting, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-xs p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-booking-title"
    >
      <div className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-2xl border border-stone-200 shadow-xl overflow-hidden">
        <div className="sm:hidden w-10 h-1.5 bg-stone-300 rounded-full mx-auto mt-3" />

        <div className="px-6 py-4 border-b border-stone-200 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <CalendarCheck2 className="w-5 h-5 text-[#1E3A2F]" aria-hidden="true" />
            <h2 id="confirm-booking-title" className="font-display text-lg font-semibold text-stone-900">
              Confirm Appointment
            </h2>
          </div>
          <button
            type="button"
            disabled={submitting}
            onClick={onCancel}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-stone-500 hover:text-stone-900 hover:bg-stone-100 transition-colors disabled:opacity-40"
            aria-label="Cancel confirmation"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <p className="text-sm text-stone-600">
            {mode === 'live'
              ? 'This will create a confirmed appointment event in Google Calendar and lock your chair time.'
              : 'Preview mode is active. Confirming will reserve this slot in the studio demo schedule.'}
          </p>

          <dl className="divide-y divide-stone-100 border border-stone-200 rounded-xl bg-stone-50/70 text-sm">
            <div className="px-4 py-3 flex items-center justify-between gap-4">
              <dt className="text-stone-500">Service</dt>
              <dd className="font-medium text-stone-900 text-right">
                {service.name} ({service.durationMin} min)
              </dd>
            </div>
            {showPrice && (
              <div className="px-4 py-3 flex items-center justify-between gap-4">
                <dt className="text-stone-500">Pay in studio</dt>
                <dd className="font-mono tabular-nums font-medium text-stone-900">
                  ${service.priceAud} AUD
                </dd>
              </div>
            )}
            <div className="px-4 py-3 flex items-center justify-between gap-4">
              <dt className="text-stone-500">Sydney time</dt>
              <dd className="font-medium text-stone-900 text-right tabular-nums">
                {dateLabel} · {timeLabel}
              </dd>
            </div>
            <div className="px-4 py-3 flex items-center justify-between gap-4">
              <dt className="text-stone-500">Client</dt>
              <dd className="font-medium text-stone-900 text-right">{customerName}</dd>
            </div>
            <div className="px-4 py-3 flex items-center justify-between gap-4">
              <dt className="text-stone-500">Mobile</dt>
              <dd className="font-mono tabular-nums text-stone-900 text-right">{customerPhone}</dd>
            </div>
          </dl>

          <p className="text-xs text-stone-500 leading-relaxed">
            Free reschedule or cancellation up to {STUDIO_INFO.cancellationWindowHours} hours prior.
            All times are Australia/Sydney.
          </p>

          <div className="flex flex-col-reverse sm:flex-row gap-3 pt-1">
            <button
              type="button"
              disabled={submitting}
              onClick={onCancel}
              className="min-h-[48px] flex-1 px-4 py-3 rounded-xl border border-stone-300 text-sm font-medium text-stone-700 hover:bg-stone-50 transition-colors disabled:opacity-50"
            >
              Go Back
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={onConfirm}
              className="min-h-[48px] flex-1 px-4 py-3 rounded-xl bg-[#1E3A2F] text-white text-sm font-semibold hover:bg-[#162C23] transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Locking Slot...</span>
                </>
              ) : (
                <span>Book Appointment</span>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

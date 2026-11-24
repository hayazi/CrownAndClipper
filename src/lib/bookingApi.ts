import type { BarberService } from '../../shared/services';
import type { SydneyDayOption } from '../../shared/sydneyTime';
import type {
  ConfirmedBooking,
  ServerCalendarCapabilities,
  TimeSlotOption,
} from '../../server/calendarService';

export type BookingMode = 'mock' | 'live';

export interface StudioBootstrapResponse {
  studio: {
    brandName: string;
    barberName: string;
    barberRole: string;
    address: string;
    suburb: string;
    timezone: string;
    instagramHandle: string;
    tiktokHandle: string;
    cancellationWindowHours: number;
    gracePeriodMinutes: number;
  };
  services: BarberService[];
  days: SydneyDayOption[];
  capabilities: ServerCalendarCapabilities;
}

export interface SlotsResponse {
  mode: BookingMode;
  provider: string;
  dateStr: string;
  timezone: string;
  isOpen: boolean;
  slots: TimeSlotOption[];
  busyCount: number;
}

export class ApiRequestError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function buildHeaders(accessToken: string | null, mode: BookingMode): HeadersInit {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Booking-Mode': mode,
  };
  if (mode === 'live' && accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }
  return headers;
}

export async function fetchStudioBootstrap(): Promise<StudioBootstrapResponse> {
  const res = await fetch('/api/studio');
  if (!res.ok) {
    throw new ApiRequestError('Unable to load studio schedule.', res.status);
  }
  return (await res.json()) as StudioBootstrapResponse;
}

export async function fetchAvailableSlots(params: {
  dateStr: string;
  serviceId: string;
  mode: BookingMode;
  accessToken: string | null;
}): Promise<SlotsResponse> {
  const url = `/api/calendar/slots?date=${encodeURIComponent(params.dateStr)}&serviceId=${encodeURIComponent(params.serviceId)}&mode=${encodeURIComponent(params.mode)}`;
  const res = await fetch(url, {
    headers: buildHeaders(params.accessToken, params.mode),
  });
  const body = (await res.json()) as SlotsResponse & { error?: string; code?: string };
  if (!res.ok) {
    throw new ApiRequestError(
      body.error || 'Could not load available slots.',
      res.status,
      body.code,
    );
  }
  return body;
}

export async function submitBooking(params: {
  name: string;
  phone: string;
  serviceId: string;
  startUtcMs: number;
  consentAccepted: boolean;
  mode: BookingMode;
  accessToken: string | null;
}): Promise<ConfirmedBooking> {
  const res = await fetch('/api/calendar/bookings', {
    method: 'POST',
    headers: buildHeaders(params.accessToken, params.mode),
    body: JSON.stringify({
      name: params.name,
      phone: params.phone,
      serviceId: params.serviceId,
      startUtcMs: params.startUtcMs,
      consentAccepted: params.consentAccepted,
    }),
  });

  const body = (await res.json()) as {
    booking?: ConfirmedBooking;
    error?: string;
    code?: string;
  };
  if (!res.ok || !body.booking) {
    throw new ApiRequestError(
      body.error || 'Could not confirm booking.',
      res.status,
      body.code,
    );
  }
  return body.booking;
}

export async function resetMockSchedule(): Promise<void> {
  await fetch('/api/calendar/mock-reset', { method: 'POST' });
}

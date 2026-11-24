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

export interface AdminAuthStatusResponse {
  configured: boolean;
  source: 'env' | 'claimed' | 'unclaimed';
}

export interface AdminSessionResponse {
  token: string;
  expiresAt: number;
  username: string;
}

export interface ServiceFormPayload {
  name: string;
  durationMin: number;
  priceAud: number;
  description: string;
  popular: boolean;
  active: boolean;
}

export async function fetchAdminStatus(): Promise<AdminAuthStatusResponse> {
  const res = await fetch('/api/admin/status');
  if (!res.ok) {
    throw new ApiRequestError('Unable to check admin status.', res.status);
  }
  return (await res.json()) as AdminAuthStatusResponse;
}

export async function bootstrapAdmin(params: {
  username: string;
  password: string;
}): Promise<AdminSessionResponse> {
  const res = await fetch('/api/admin/bootstrap', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const body = (await res.json()) as AdminSessionResponse & { error?: string };
  if (!res.ok || !body.token) {
    throw new ApiRequestError(body.error || 'Could not claim admin access.', res.status);
  }
  return body;
}

export async function loginAdmin(params: {
  username: string;
  password: string;
}): Promise<AdminSessionResponse> {
  const res = await fetch('/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const body = (await res.json()) as AdminSessionResponse & { error?: string };
  if (!res.ok || !body.token) {
    throw new ApiRequestError(body.error || 'Invalid username or password.', res.status);
  }
  return body;
}

export async function fetchAdminServices(adminToken: string): Promise<BarberService[]> {
  const res = await fetch('/api/admin/services', {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const body = (await res.json()) as { services?: BarberService[]; error?: string };
  if (!res.ok || !body.services) {
    throw new ApiRequestError(body.error || 'Unable to load services.', res.status);
  }
  return body.services;
}

export async function createAdminService(
  adminToken: string,
  payload: ServiceFormPayload,
): Promise<{ services: BarberService[]; publicServices: BarberService[] }> {
  const res = await fetch('/api/admin/services', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify(payload),
  });
  const body = (await res.json()) as {
    services?: BarberService[];
    publicServices?: BarberService[];
    error?: string;
  };
  if (!res.ok || !body.services || !body.publicServices) {
    throw new ApiRequestError(body.error || 'Unable to create service.', res.status);
  }
  return { services: body.services, publicServices: body.publicServices };
}

export async function updateAdminService(
  adminToken: string,
  serviceId: string,
  payload: ServiceFormPayload,
): Promise<{ services: BarberService[]; publicServices: BarberService[] }> {
  const res = await fetch(`/api/admin/services/${encodeURIComponent(serviceId)}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify(payload),
  });
  const body = (await res.json()) as {
    services?: BarberService[];
    publicServices?: BarberService[];
    error?: string;
  };
  if (!res.ok || !body.services || !body.publicServices) {
    throw new ApiRequestError(body.error || 'Unable to update service.', res.status);
  }
  return { services: body.services, publicServices: body.publicServices };
}


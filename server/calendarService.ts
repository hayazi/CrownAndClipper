import { OAuth2Client, JWT } from 'google-auth-library';
import { STUDIO_INFO } from '../shared/services.ts';
import {
  addDaysToDateStr,
  formatSydneyDateShort,
  formatSydneyIsoOffset,
  formatSydneyTime,
  getStudioHoursForSydneyDate,
  getSydneyTodayStr,
  sydneyLocalToUtcMs,
  SYDNEY_TIMEZONE,
} from '../shared/sydneyTime.ts';
import type { ValidatedBookingInput } from './validation.ts';

export type CalendarProviderMode = 'mock' | 'bearer' | 'service_account' | 'refresh_token';

export interface BusyWindow {
  startMs: number;
  endMs: number;
  label?: string;
}

export interface TimeSlotOption {
  startUtcMs: number;
  endUtcMs: number;
  startIsoSydney: string;
  endIsoSydney: string;
  timeLabel: string;
  period: 'morning' | 'afternoon' | 'evening';
  available: boolean;
}

export interface ConfirmedBooking {
  bookingId: string;
  mode: 'mock' | 'live';
  eventId: string;
  htmlLink?: string;
  calendarId: string;
  serviceId: string;
  serviceName: string;
  durationMin: number;
  priceAud: number;
  customerName: string;
  customerPhone: string;
  dateStr: string;
  startUtcMs: number;
  endUtcMs: number;
  startIsoSydney: string;
  endIsoSydney: string;
  timeLabel: string;
  dateLabel: string;
  timezone: string;
}

export interface ServerCalendarCapabilities {
  defaultMode: 'mock' | 'live';
  hasServerCredentials: boolean;
  serverCredentialType: 'service_account' | 'refresh_token' | 'none';
  calendarId: string;
  timezone: string;
}

// Concurrency-safe in-memory lock chain to serialize overlapping booking attempts
const slotMutexMap = new Map<string, Promise<unknown>>();

async function withBookingLock<T>(lockKey: string, task: () => Promise<T>): Promise<T> {
  const prev = slotMutexMap.get(lockKey) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const chained = prev.then(() => gate);
  slotMutexMap.set(lockKey, chained);

  await prev;
  try {
    return await task();
  } finally {
    release();
    if (slotMutexMap.get(lockKey) === chained) {
      slotMutexMap.delete(lockKey);
    }
  }
}

// Mock busy store seeded dynamically relative to current Sydney date
interface MockBookingRecord {
  id: string;
  startMs: number;
  endMs: number;
  label: string;
}

const mockBookingsByDate = new Map<string, MockBookingRecord[]>();

function ensureMockSeedForDate(dateStr: string): MockBookingRecord[] {
  const existing = mockBookingsByDate.get(dateStr);
  if (existing) return existing;

  const hours = getStudioHoursForSydneyDate(dateStr);
  if (!hours) {
    mockBookingsByDate.set(dateStr, []);
    return [];
  }

  const todayStr = getSydneyTodayStr();
  const tomorrowStr = addDaysToDateStr(todayStr, 1);

  const seeded: MockBookingRecord[] = [];
  const addSeed = (h: number, m: number, durMin: number, label: string, idSuffix: string) => {
    const startMs = sydneyLocalToUtcMs(dateStr, h, m);
    const endMs = startMs + durMin * 60_000;
    const closeMs = sydneyLocalToUtcMs(dateStr, hours.closeHour, hours.closeMinute);
    const openMs = sydneyLocalToUtcMs(dateStr, hours.openHour, hours.openMinute);
    if (startMs >= openMs && endMs <= closeMs) {
      seeded.push({ id: `seed-${dateStr}-${idSuffix}`, startMs, endMs, label });
    }
  };

  // Seed realistic Sydney barber busy blocks & lunch break
  if (dateStr === todayStr) {
    addSeed(10, 0, 45, 'Client Cut', 'a');
    addSeed(12, 30, 30, 'Lunch Break', 'b');
    addSeed(15, 0, 60, 'Cut & Beard', 'c');
    addSeed(17, 30, 45, 'After-Work Fade', 'd');
  } else if (dateStr === tomorrowStr) {
    addSeed(9, 30, 45, 'Client Cut', 'a');
    addSeed(13, 0, 30, 'Lunch Break', 'b');
    addSeed(16, 0, 60, 'Cut & Beard', 'c');
  } else {
    addSeed(11, 0, 45, 'Client Cut', 'a');
    addSeed(13, 0, 30, 'Lunch Break', 'b');
  }

  mockBookingsByDate.set(dateStr, seeded);
  return seeded;
}

export function getServerCalendarCapabilities(): ServerCalendarCapabilities {
  const calendarId = process.env.GOOGLE_CALENDAR_ID?.trim() || 'primary';
  const hasServiceAccount = Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim());
  const hasRefreshToken = Boolean(
    process.env.GOOGLE_OAUTH_CLIENT_ID?.trim() &&
      process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim() &&
      process.env.GOOGLE_OAUTH_REFRESH_TOKEN?.trim(),
  );

  const serverCredentialType = hasServiceAccount
    ? 'service_account'
    : hasRefreshToken
      ? 'refresh_token'
      : 'none';

  const envMode = process.env.BOOKING_MODE?.trim().toLowerCase();
  const hasServerCredentials = serverCredentialType !== 'none';
  const defaultMode: 'mock' | 'live' =
    envMode === 'live' && hasServerCredentials ? 'live' : hasServerCredentials && envMode !== 'mock' ? 'live' : 'mock';

  return {
    defaultMode,
    hasServerCredentials,
    serverCredentialType,
    calendarId,
    timezone: SYDNEY_TIMEZONE,
  };
}

async function getServerGoogleAccessToken(): Promise<{
  token: string;
  type: 'service_account' | 'refresh_token';
} | null> {
  const saJsonRaw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  if (saJsonRaw) {
    const credentials = JSON.parse(saJsonRaw) as {
      client_email: string;
      private_key: string;
    };
    const jwtClient = new JWT({
      email: credentials.client_email,
      key: credentials.private_key,
      scopes: [
        'https://www.googleapis.com/auth/calendar.events',
        'https://www.googleapis.com/auth/calendar.freebusy',
      ],
    });
    const res = await jwtClient.getAccessToken();
    if (!res.token) {
      throw new Error('Failed to mint Google Service Account access token.');
    }
    return { token: res.token, type: 'service_account' };
  }

  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim();
  const refreshToken = process.env.GOOGLE_OAUTH_REFRESH_TOKEN?.trim();
  if (clientId && clientSecret && refreshToken) {
    const oauth2Client = new OAuth2Client(clientId, clientSecret);
    oauth2Client.setCredentials({ refresh_token: refreshToken });
    const res = await oauth2Client.getAccessToken();
    if (!res.token) {
      throw new Error('Failed to refresh Google OAuth access token.');
    }
    return { token: res.token, type: 'refresh_token' };
  }

  return null;
}

async function resolveAccessToken(
  requestedMode: string | undefined,
  bearerToken: string | undefined,
): Promise<{
  mode: CalendarProviderMode;
  token?: string;
  calendarId: string;
}> {
  const calendarId = process.env.GOOGLE_CALENDAR_ID?.trim() || 'primary';

  if (requestedMode === 'mock') {
    return { mode: 'mock', calendarId };
  }

  if (bearerToken && bearerToken.trim().length > 10) {
    return { mode: 'bearer', token: bearerToken.trim(), calendarId };
  }

  const serverCred = await getServerGoogleAccessToken();
  if (serverCred) {
    return { mode: serverCred.type, token: serverCred.token, calendarId };
  }

  if (requestedMode === 'live') {
    throw new GoogleCalendarAuthError(
      'Google Calendar is not connected. Connect with Google or switch to Mock Mode.',
    );
  }

  return { mode: 'mock', calendarId };
}

export class GoogleCalendarAuthError extends Error {
  statusCode = 401;
}

export class BookingConflictError extends Error {
  statusCode = 409;
}

export class GoogleCalendarUpstreamError extends Error {
  statusCode = 502;
}

async function fetchGoogleBusyWindows(
  token: string,
  calendarId: string,
  timeMinIso: string,
  timeMaxIso: string,
): Promise<BusyWindow[]> {
  const response = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      timeMin: timeMinIso,
      timeMax: timeMaxIso,
      timeZone: SYDNEY_TIMEZONE,
      items: [{ id: calendarId }],
    }),
  });

  if (response.status === 401 || response.status === 403) {
    throw new GoogleCalendarAuthError(
      'Google Calendar authorization expired or lacks permission. Please sign in again.',
    );
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new GoogleCalendarUpstreamError(
      `Unable to read Google Calendar availability (${response.status}). ${errText.slice(0, 120)}`,
    );
  }

  const data = (await response.json()) as {
    calendars?: Record<
      string,
      {
        busy?: Array<{ start: string; end: string }>;
        errors?: Array<{ reason: string }>;
      }
    >;
  };

  const calEntry = data.calendars?.[calendarId];
  if (calEntry?.errors && calEntry.errors.length > 0) {
    throw new GoogleCalendarUpstreamError(
      `Google Calendar returned an error for ${calendarId}: ${calEntry.errors[0].reason}`,
    );
  }

  const busy = calEntry?.busy ?? [];
  return busy.map((item) => ({
    startMs: new Date(item.start).getTime(),
    endMs: new Date(item.end).getTime(),
  }));
}

async function insertGoogleCalendarEvent(
  token: string,
  calendarId: string,
  booking: ValidatedBookingInput,
): Promise<{ eventId: string; htmlLink?: string }> {
  const startIso = formatSydneyIsoOffset(booking.startUtcMs);
  const endIso = formatSydneyIsoOffset(booking.endUtcMs);

  const descriptionLines = [
    `Service: ${booking.service.name} (${booking.service.durationMin} min · $${booking.service.priceAud} AUD)`,
    `Client: ${booking.name}`,
    `Mobile: ${booking.phoneDisplay} (${booking.phoneNormalized})`,
    `Timezone: ${SYDNEY_TIMEZONE}`,
    `Cancellation Policy: Free reschedule/cancel up to ${STUDIO_INFO.cancellationWindowHours}h prior.`,
    `Booked via ${STUDIO_INFO.brandName} Web App`,
  ];

  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        summary: `${booking.service.name} — ${booking.name}`,
        location: STUDIO_INFO.address,
        description: descriptionLines.join('\n'),
        start: {
          dateTime: startIso,
          timeZone: SYDNEY_TIMEZONE,
        },
        end: {
          dateTime: endIso,
          timeZone: SYDNEY_TIMEZONE,
        },
        reminders: {
          useDefault: false,
          overrides: [
            { method: 'popup', minutes: 60 },
            { method: 'popup', minutes: 15 },
          ],
        },
        extendedProperties: {
          private: {
            source: 'crown-and-clipper-booking',
            serviceId: booking.service.id,
            phone: booking.phoneNormalized,
          },
        },
      }),
    },
  );

  if (response.status === 401 || response.status === 403) {
    throw new GoogleCalendarAuthError(
      'Google Calendar authorization expired or lacks write permission. Please sign in again.',
    );
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new GoogleCalendarUpstreamError(
      `Failed to create Google Calendar event (${response.status}). ${errText.slice(0, 120)}`,
    );
  }

  const created = (await response.json()) as { id: string; htmlLink?: string };
  return { eventId: created.id, htmlLink: created.htmlLink };
}

function overlapsBusy(startMs: number, endMs: number, busyList: BusyWindow[]): boolean {
  return busyList.some((b) => startMs < b.endMs && endMs > b.startMs);
}

export async function getAvailableSlotsForDate(params: {
  dateStr: string;
  durationMin: number;
  requestedMode?: string;
  bearerToken?: string;
}): Promise<{
  mode: 'mock' | 'live';
  provider: CalendarProviderMode;
  dateStr: string;
  timezone: string;
  isOpen: boolean;
  slots: TimeSlotOption[];
  busyCount: number;
}> {
  const { dateStr, durationMin, requestedMode, bearerToken } = params;
  const hours = getStudioHoursForSydneyDate(dateStr);
  const resolved = await resolveAccessToken(requestedMode, bearerToken);
  const publicMode: 'mock' | 'live' = resolved.mode === 'mock' ? 'mock' : 'live';

  if (!hours) {
    return {
      mode: publicMode,
      provider: resolved.mode,
      dateStr,
      timezone: SYDNEY_TIMEZONE,
      isOpen: false,
      slots: [],
      busyCount: 0,
    };
  }

  const openUtcMs = sydneyLocalToUtcMs(dateStr, hours.openHour, hours.openMinute);
  const closeUtcMs = sydneyLocalToUtcMs(dateStr, hours.closeHour, hours.closeMinute);

  let busyWindows: BusyWindow[] = [];
  if (resolved.mode === 'mock') {
    busyWindows = ensureMockSeedForDate(dateStr).map((item) => ({
      startMs: item.startMs,
      endMs: item.endMs,
      label: item.label,
    }));
  } else if (resolved.token) {
    busyWindows = await fetchGoogleBusyWindows(
      resolved.token,
      resolved.calendarId,
      formatSydneyIsoOffset(openUtcMs),
      formatSydneyIsoOffset(closeUtcMs),
    );
  }

  const nowMs = Date.now();
  const minLeadMs = 30 * 60 * 1000;
  const stepMs = 30 * 60 * 1000;
  const durationMs = durationMin * 60 * 1000;

  const slots: TimeSlotOption[] = [];
  for (let cursor = openUtcMs; cursor + durationMs <= closeUtcMs; cursor += stepMs) {
    const endMs = cursor + durationMs;
    const isFuture = cursor >= nowMs + minLeadMs;
    const isFree = !overlapsBusy(cursor, endMs, busyWindows);

    // Determine period in Australia/Sydney
    const timeLabel = formatSydneyTime(cursor);
    const sydneyHour = Number(
      new Intl.DateTimeFormat('en-AU', {
        timeZone: SYDNEY_TIMEZONE,
        hour: '2-digit',
        hourCycle: 'h23',
      }).format(new Date(cursor)),
    );
    const period: 'morning' | 'afternoon' | 'evening' =
      sydneyHour < 12 ? 'morning' : sydneyHour < 17 ? 'afternoon' : 'evening';

    slots.push({
      startUtcMs: cursor,
      endUtcMs: endMs,
      startIsoSydney: formatSydneyIsoOffset(cursor),
      endIsoSydney: formatSydneyIsoOffset(endMs),
      timeLabel,
      period,
      available: isFuture && isFree,
    });
  }

  return {
    mode: publicMode,
    provider: resolved.mode,
    dateStr,
    timezone: SYDNEY_TIMEZONE,
    isOpen: true,
    slots,
    busyCount: busyWindows.length,
  };
}

export async function createBookingWithConflictGuard(params: {
  input: ValidatedBookingInput;
  requestedMode?: string;
  bearerToken?: string;
}): Promise<ConfirmedBooking> {
  const { input, requestedMode, bearerToken } = params;
  const resolved = await resolveAccessToken(requestedMode, bearerToken);
  const lockKey = `${resolved.mode}:${resolved.calendarId}:${input.dateStr}`;

  return withBookingLock(lockKey, async () => {
    const hours = getStudioHoursForSydneyDate(input.dateStr);
    if (!hours) {
      throw new BookingConflictError('The studio is closed on the selected day.');
    }

    const windowStartIso = formatSydneyIsoOffset(input.startUtcMs);
    const windowEndIso = formatSydneyIsoOffset(input.endUtcMs);

    if (resolved.mode === 'mock') {
      const mockBusy = ensureMockSeedForDate(input.dateStr);
      if (overlapsBusy(input.startUtcMs, input.endUtcMs, mockBusy)) {
        throw new BookingConflictError(
          'That slot was just booked. Please pick another available time.',
        );
      }

      const eventId = `mock_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
      mockBusy.push({
        id: eventId,
        startMs: input.startUtcMs,
        endMs: input.endUtcMs,
        label: `${input.service.name} — ${input.name}`,
      });

      return {
        bookingId: eventId,
        mode: 'mock',
        eventId,
        calendarId: 'mock-sydney-calendar',
        serviceId: input.service.id,
        serviceName: input.service.name,
        durationMin: input.service.durationMin,
        priceAud: input.service.priceAud,
        customerName: input.name,
        customerPhone: input.phoneDisplay,
        dateStr: input.dateStr,
        startUtcMs: input.startUtcMs,
        endUtcMs: input.endUtcMs,
        startIsoSydney: windowStartIso,
        endIsoSydney: windowEndIso,
        timeLabel: formatSydneyTime(input.startUtcMs),
        dateLabel: formatSydneyDateShort(input.startUtcMs),
        timezone: SYDNEY_TIMEZONE,
      };
    }

    if (!resolved.token) {
      throw new GoogleCalendarAuthError('Google Calendar access token is missing.');
    }

    // Re-check Google Calendar busy times right before inserting to prevent double bookings
    const liveBusy = await fetchGoogleBusyWindows(
      resolved.token,
      resolved.calendarId,
      windowStartIso,
      windowEndIso,
    );

    if (overlapsBusy(input.startUtcMs, input.endUtcMs, liveBusy)) {
      throw new BookingConflictError(
        'That slot was just booked in Google Calendar. Please choose another available time.',
      );
    }

    const created = await insertGoogleCalendarEvent(
      resolved.token,
      resolved.calendarId,
      input,
    );

    return {
      bookingId: created.eventId,
      mode: 'live',
      eventId: created.eventId,
      htmlLink: created.htmlLink,
      calendarId: resolved.calendarId,
      serviceId: input.service.id,
      serviceName: input.service.name,
      durationMin: input.service.durationMin,
      priceAud: input.service.priceAud,
      customerName: input.name,
      customerPhone: input.phoneDisplay,
      dateStr: input.dateStr,
      startUtcMs: input.startUtcMs,
      endUtcMs: input.endUtcMs,
      startIsoSydney: windowStartIso,
      endIsoSydney: windowEndIso,
      timeLabel: formatSydneyTime(input.startUtcMs),
      dateLabel: formatSydneyDateShort(input.startUtcMs),
      timezone: SYDNEY_TIMEZONE,
    };
  });
}

export function resetMockBookings(): void {
  mockBookingsByDate.clear();
}

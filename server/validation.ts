import { type BarberService } from '../shared/services.ts';
import { getActiveServiceById, type ServiceMutationInput } from './studioStore.ts';
import {
  addDaysToDateStr,
  getStudioHoursForSydneyDate,
  getSydneyTodayStr,
  getSydneyWallParts,
  sydneyLocalToUtcMs,
} from '../shared/sydneyTime.ts';

export interface ValidatedBookingInput {
  name: string;
  phoneNormalized: string;
  phoneDisplay: string;
  service: BarberService;
  dateStr: string;
  startUtcMs: number;
  endUtcMs: number;
  consentAccepted: boolean;
}

export function sanitizePlainText(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeAustralianMobile(raw: unknown): {
  normalized: string;
  display: string;
} | null {
  if (typeof raw !== 'string') return null;
  const cleaned = raw.replace(/[\s\-().]/g, '');

  let nationalTen = '';
  if (/^04\d{8}$/.test(cleaned)) {
    nationalTen = cleaned;
  } else if (/^\+614\d{8}$/.test(cleaned)) {
    nationalTen = '0' + cleaned.slice(3);
  } else if (/^614\d{8}$/.test(cleaned)) {
    nationalTen = '0' + cleaned.slice(2);
  } else {
    return null;
  }

  return {
    normalized: `+61${nationalTen.slice(1)}`,
    display: `${nationalTen.slice(0, 4)} ${nationalTen.slice(4, 7)} ${nationalTen.slice(7)}`,
  };
}

export function validateSydneyDateStr(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;

  const today = getSydneyTodayStr();
  const maxDate = addDaysToDateStr(today, 30);
  if (raw < today || raw > maxDate) return null;
  return raw;
}

export function validateBookingPayload(body: unknown): {
  ok: true;
  data: ValidatedBookingInput;
} | {
  ok: false;
  error: string;
} {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Invalid booking payload.' };
  }

  const record = body as Record<string, unknown>;
  const name = sanitizePlainText(record.name);
  if (name.length < 2 || name.length > 80) {
    return { ok: false, error: 'Please enter your name (2 to 80 characters).' };
  }

  const phone = normalizeAustralianMobile(record.phone);
  if (!phone) {
    return {
      ok: false,
      error: 'Please enter a valid Australian mobile number (e.g. 0412 345 678).',
    };
  }

  if (typeof record.serviceId !== 'string') {
    return { ok: false, error: 'Please select a service.' };
  }
  const service = getActiveServiceById(record.serviceId);
  if (!service) {
    return { ok: false, error: 'Selected service was not found or is inactive.' };
  }

  if (record.consentAccepted !== true) {
    return {
      ok: false,
      error: 'Please accept the booking terms and privacy notice before confirming.',
    };
  }

  const startUtcMs = Number(record.startUtcMs);
  if (!Number.isFinite(startUtcMs)) {
    return { ok: false, error: 'Invalid appointment start time.' };
  }

  const nowMs = Date.now();
  const minLeadMs = 30 * 60 * 1000;
  if (startUtcMs < nowMs + minLeadMs) {
    return {
      ok: false,
      error: 'Appointments must be booked at least 30 minutes in advance (Sydney time).',
    };
  }

  const wall = getSydneyWallParts(startUtcMs);
  const dateStr = `${String(wall.year).padStart(4, '0')}-${String(wall.month).padStart(2, '0')}-${String(wall.day).padStart(2, '0')}`;
  const validDate = validateSydneyDateStr(dateStr);
  if (!validDate) {
    return { ok: false, error: 'Selected date is outside our 30-day booking window.' };
  }

  if (wall.minute % 30 !== 0 || wall.second !== 0) {
    return { ok: false, error: 'Appointment time must align to a 30-minute studio slot.' };
  }

  const hours = getStudioHoursForSydneyDate(dateStr);
  if (!hours) {
    return { ok: false, error: 'The studio is closed on Mondays (Sydney time).' };
  }

  const openUtcMs = sydneyLocalToUtcMs(dateStr, hours.openHour, hours.openMinute);
  const closeUtcMs = sydneyLocalToUtcMs(dateStr, hours.closeHour, hours.closeMinute);
  const endUtcMs = startUtcMs + service.durationMin * 60 * 1000;

  if (startUtcMs < openUtcMs || endUtcMs > closeUtcMs) {
    return { ok: false, error: 'Selected time falls outside Sydney studio trading hours.' };
  }

  return {
    ok: true,
    data: {
      name,
      phoneNormalized: phone.normalized,
      phoneDisplay: phone.display,
      service,
      dateStr,
      startUtcMs,
      endUtcMs,
      consentAccepted: true,
    },
  };
}

export function validateServiceMutationPayload(body: unknown): {
  ok: true;
  data: ServiceMutationInput;
} | {
  ok: false;
  error: string;
} {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Invalid service payload.' };
  }

  const record = body as Record<string, unknown>;
  const name = sanitizePlainText(record.name);
  if (name.length < 2 || name.length > 60) {
    return { ok: false, error: 'Service name must be between 2 and 60 characters.' };
  }

  const durationMin = Number(record.durationMin);
  if (
    !Number.isInteger(durationMin) ||
    durationMin < 15 ||
    durationMin > 180 ||
    durationMin % 15 !== 0
  ) {
    return {
      ok: false,
      error: 'Duration must be a multiple of 15 minutes (15 to 180 min).',
    };
  }

  const priceAud = Number(record.priceAud);
  if (!Number.isFinite(priceAud) || priceAud < 0 || priceAud > 999) {
    return { ok: false, error: 'AUD price must be between $0 and $999.' };
  }

  const description = sanitizePlainText(record.description);
  if (description.length < 8 || description.length > 240) {
    return {
      ok: false,
      error: 'Description must be between 8 and 240 characters.',
    };
  }

  const popular = Boolean(record.popular);
  const active = record.active === undefined ? true : Boolean(record.active);

  return {
    ok: true,
    data: {
      name,
      durationMin,
      priceAud: Math.round(priceAud),
      description,
      popular,
      active,
    },
  };
}


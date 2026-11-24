export const SYDNEY_TIMEZONE = 'Australia/Sydney';

const SYDNEY_PARTS_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: SYDNEY_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

const SYDNEY_WEEKDAY_FORMATTER = new Intl.DateTimeFormat('en-AU', {
  timeZone: SYDNEY_TIMEZONE,
  weekday: 'short',
});

const SYDNEY_FULL_DATE_FORMATTER = new Intl.DateTimeFormat('en-AU', {
  timeZone: SYDNEY_TIMEZONE,
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

const SYDNEY_SHORT_DATE_FORMATTER = new Intl.DateTimeFormat('en-AU', {
  timeZone: SYDNEY_TIMEZONE,
  weekday: 'short',
  day: 'numeric',
  month: 'short',
});

const SYDNEY_TIME_FORMATTER = new Intl.DateTimeFormat('en-AU', {
  timeZone: SYDNEY_TIMEZONE,
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});

const SYDNEY_ZONE_ABBR_FORMATTER = new Intl.DateTimeFormat('en-AU', {
  timeZone: SYDNEY_TIMEZONE,
  timeZoneName: 'short',
});

export interface SydneyWallParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

export interface StudioDayHours {
  openHour: number;
  openMinute: number;
  closeHour: number;
  closeMinute: number;
}

export interface SydneyDayOption {
  dateStr: string;
  weekdayShort: string;
  dayNumber: string;
  monthShort: string;
  isToday: boolean;
  isOpen: boolean;
  hoursLabel: string;
}

export function getSydneyWallParts(utcMs: number): SydneyWallParts {
  const parts = SYDNEY_PARTS_FORMATTER.formatToParts(new Date(utcMs));
  const map: Record<string, number> = {};
  for (const part of parts) {
    if (part.type !== 'literal') {
      map[part.type] = Number(part.value);
    }
  }
  return {
    year: map.year,
    month: map.month,
    day: map.day,
    hour: map.hour === 24 ? 0 : map.hour,
    minute: map.minute,
    second: map.second,
  };
}

export function sydneyLocalToUtcMs(
  dateStr: string,
  hour: number,
  minute: number,
): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!match) {
    throw new Error('Invalid Sydney date string');
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  const desiredAsUtc = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  let candidate = desiredAsUtc - 10 * 3600 * 1000;

  for (let i = 0; i < 3; i += 1) {
    const actual = getSydneyWallParts(candidate);
    const actualAsUtc = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
      actual.second,
      0,
    );
    const diff = desiredAsUtc - actualAsUtc;
    if (diff === 0) break;
    candidate += diff;
  }

  return candidate;
}

export function formatSydneyIsoOffset(utcMs: number): string {
  const actual = getSydneyWallParts(utcMs);
  const actualAsUtc = Date.UTC(
    actual.year,
    actual.month - 1,
    actual.day,
    actual.hour,
    actual.minute,
    actual.second,
    0,
  );
  const offsetMinutes = Math.round((actualAsUtc - utcMs) / 60000);
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const absMins = Math.abs(offsetMinutes);
  const offH = String(Math.floor(absMins / 60)).padStart(2, '0');
  const offM = String(absMins % 60).padStart(2, '0');

  const yyyy = String(actual.year).padStart(4, '0');
  const mm = String(actual.month).padStart(2, '0');
  const dd = String(actual.day).padStart(2, '0');
  const hh = String(actual.hour).padStart(2, '0');
  const min = String(actual.minute).padStart(2, '0');
  const ss = String(actual.second).padStart(2, '0');

  return `${yyyy}-${mm}-${dd}T${hh}:${min}:${ss}${sign}${offH}:${offM}`;
}

export function getSydneyTodayStr(nowMs: number = Date.now()): string {
  const parts = getSydneyWallParts(nowMs);
  return `${String(parts.year).padStart(4, '0')}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

export function addDaysToDateStr(dateStr: string, offsetDays: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!match) throw new Error('Invalid date string');
  const base = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + offsetDays));
  const yyyy = base.getUTCFullYear();
  const mm = String(base.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(base.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function getSydneyWeekdayIndex(dateStr: string): number {
  const middayUtc = sydneyLocalToUtcMs(dateStr, 12, 0);
  const short = SYDNEY_WEEKDAY_FORMATTER.format(new Date(middayUtc));
  const normalized = short.slice(0, 3).toLowerCase();
  const map: Record<string, number> = {
    sun: 0,
    mon: 1,
    tue: 2,
    wed: 3,
    thu: 4,
    fri: 5,
    sat: 6,
  };
  return map[normalized] ?? 0;
}

export function getStudioHoursForSydneyDate(dateStr: string): StudioDayHours | null {
  const day = getSydneyWeekdayIndex(dateStr);
  if (day === 1) {
    return null; // Closed Mondays
  }
  if (day === 6) {
    return { openHour: 8, openMinute: 30, closeHour: 17, closeMinute: 30 };
  }
  if (day === 0) {
    return { openHour: 10, openMinute: 0, closeHour: 15, closeMinute: 30 };
  }
  return { openHour: 9, openMinute: 0, closeHour: 19, closeMinute: 0 };
}

export function formatSydneyTime(utcMs: number): string {
  return SYDNEY_TIME_FORMATTER.format(new Date(utcMs)).replace(/\s+/g, ' ').toLowerCase();
}

export function formatSydneyDateLong(utcMs: number): string {
  return SYDNEY_FULL_DATE_FORMATTER.format(new Date(utcMs));
}

export function formatSydneyDateShort(utcMs: number): string {
  return SYDNEY_SHORT_DATE_FORMATTER.format(new Date(utcMs));
}

export function getSydneyZoneLabel(utcMs: number = Date.now()): string {
  const parts = SYDNEY_ZONE_ABBR_FORMATTER.formatToParts(new Date(utcMs));
  const tzPart = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'AEST';
  return `${tzPart} · Australia/Sydney`;
}

export function getNextSydneyDays(count: number = 14, nowMs: number = Date.now()): SydneyDayOption[] {
  const todayStr = getSydneyTodayStr(nowMs);
  const monthFmt = new Intl.DateTimeFormat('en-AU', {
    timeZone: SYDNEY_TIMEZONE,
    month: 'short',
  });

  const options: SydneyDayOption[] = [];
  for (let i = 0; i < count; i += 1) {
    const dateStr = addDaysToDateStr(todayStr, i);
    const midday = sydneyLocalToUtcMs(dateStr, 12, 0);
    const parts = getSydneyWallParts(midday);
    const hours = getStudioHoursForSydneyDate(dateStr);
    const hoursLabel = hours
      ? `${String(hours.openHour).padStart(2, '0')}:${String(hours.openMinute).padStart(2, '0')}–${String(hours.closeHour).padStart(2, '0')}:${String(hours.closeMinute).padStart(2, '0')}`
      : 'Closed';

    options.push({
      dateStr,
      weekdayShort: SYDNEY_WEEKDAY_FORMATTER.format(new Date(midday)),
      dayNumber: String(parts.day),
      monthShort: monthFmt.format(new Date(midday)),
      isToday: i === 0,
      isOpen: hours !== null,
      hoursLabel,
    });
  }
  return options;
}

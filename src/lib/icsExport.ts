import { STUDIO_INFO } from '../../shared/services';
import type { ConfirmedBooking } from '../../server/calendarService';

function toIcsUtcStamp(utcMs: number): string {
  const d = new Date(utcMs);
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

function escapeIcsText(val: string): string {
  return val.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
}

export function downloadBookingIcs(booking: ConfirmedBooking): void {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Crown and Clipper Sydney//Booking//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${booking.bookingId}@crownandclipper.sydney`,
    `DTSTAMP:${toIcsUtcStamp(Date.now())}`,
    `DTSTART:${toIcsUtcStamp(booking.startUtcMs)}`,
    `DTEND:${toIcsUtcStamp(booking.endUtcMs)}`,
    `SUMMARY:${escapeIcsText(`${booking.serviceName} — ${STUDIO_INFO.brandName}`)}`,
    `LOCATION:${escapeIcsText(STUDIO_INFO.address)}`,
    `DESCRIPTION:${escapeIcsText(`Barber: ${STUDIO_INFO.barberName}. Free reschedule up to ${STUDIO_INFO.cancellationWindowHours} hours prior. Timezone: Australia/Sydney.`)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ];

  const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `crown-and-clipper-${booking.dateStr}.ics`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

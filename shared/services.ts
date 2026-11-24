export interface BarberService {
  id: string;
  name: string;
  durationMin: number;
  priceAud: number;
  description: string;
  popular?: boolean;
  active?: boolean;
}

export const STUDIO_INFO = {
  brandName: 'Crown & Clipper',
  barberName: 'Liam Mercer',
  barberRole: 'Founder & Master Barber',
  address: 'Shop 2, 418 Crown St, Surry Hills NSW 2010',
  suburb: 'Surry Hills, Sydney',
  timezone: 'Australia/Sydney',
  instagramHandle: '@crownandclipper.syd',
  tiktokHandle: '@crownandclipper',
  cancellationWindowHours: 4,
  gracePeriodMinutes: 10,
} as const;

export const BARBER_SERVICES: BarberService[] = [
  {
    id: 'skin-fade',
    name: 'Signature Skin Fade',
    durationMin: 45,
    priceAud: 65,
    description: 'Foil zero fade, tailored scissor top, hot towel refresh, and matte styling.',
    popular: true,
    active: true,
  },
  {
    id: 'classic-cut',
    name: 'Classic Scissor Cut',
    durationMin: 30,
    priceAud: 55,
    description: 'Clean clipper or full scissor cut finished with tapered edges and straight razor neck.',
    active: true,
  },
  {
    id: 'cut-beard',
    name: 'Cut & Beard Sculpt',
    durationMin: 60,
    priceAud: 85,
    description: 'Full haircut or fade paired with beard shaping, razor line-up, and cedarwood oil.',
    popular: true,
    active: true,
  },
  {
    id: 'beard-lineup',
    name: 'Beard Trim & Line-Up',
    durationMin: 30,
    priceAud: 40,
    description: 'Graduated beard sculpt, crisp cheek and neck razor work, and hot towel finish.',
    active: true,
  },
  {
    id: 'buzz-taper',
    name: 'Buzz Cut & Taper',
    durationMin: 30,
    priceAud: 45,
    description: 'Single-grade clipper cut with blended temple and nape taper for an easy reset.',
    active: true,
  },
];

export function getServiceById(id: string): BarberService | undefined {
  return BARBER_SERVICES.find((service) => service.id === id);
}

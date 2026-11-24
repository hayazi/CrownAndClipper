import type { User } from 'firebase/auth';
import {
  Calendar,
  CalendarPlus,
  CheckCircle2,
  Clock,
  ExternalLink,
  Instagram,
  Loader2,
  MapPin,
  RefreshCw,
  Server,
  ShieldCheck,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ConfirmedBooking, TimeSlotOption } from '../server/calendarService';
import { BARBER_SERVICES, STUDIO_INFO, type BarberService } from '../shared/services';
import {
  formatSydneyDateLong,
  getNextSydneyDays,
  getSydneyZoneLabel,
  type SydneyDayOption,
} from '../shared/sydneyTime';
import { BookingConfirmModal } from './components/BookingConfirmModal';
import { CloudSetupModal } from './components/CloudSetupModal';
import { PolicyModal, type PolicyTab } from './components/PolicyModal';
import { StudioImage } from './components/StudioImage';
import {
  ApiRequestError,
  fetchAvailableSlots,
  fetchStudioBootstrap,
  resetMockSchedule,
  submitBooking,
  type BookingMode,
  type StudioBootstrapResponse,
} from './lib/bookingApi';
import {
  getInMemoryAccessToken,
  initCalendarAuth,
  signInWithGoogleCalendar,
  signOutGoogleCalendar,
} from './lib/googleAuth';
import { downloadBookingIcs } from './lib/icsExport';

const HERO_IMAGE = '/src/assets/images/barber_studio_hero_1795497413030.jpg';
const BARBER_IMAGE = '/src/assets/images/barber_portrait_1795497412991.jpg';
const FADE_IMAGE = '/src/assets/images/skin_fade_look_1795497413438.jpg';

function isValidAustralianMobileClient(raw: string): boolean {
  const cleaned = raw.replace(/[\s\-().]/g, '');
  return /^04\d{8}$/.test(cleaned) || /^\+614\d{8}$/.test(cleaned) || /^614\d{8}$/.test(cleaned);
}

export default function App() {
  const [bootstrap, setBootstrap] = useState<StudioBootstrapResponse | null>(null);
  const [services, setServices] = useState<BarberService[]>(BARBER_SERVICES);
  const [days, setDays] = useState<SydneyDayOption[]>(() => getNextSydneyDays(14));

  const [selectedServiceId, setSelectedServiceId] = useState<string>(BARBER_SERVICES[0].id);
  const [selectedDateStr, setSelectedDateStr] = useState<string>(() => {
    const initialDays = getNextSydneyDays(14);
    return initialDays.find((d) => d.isOpen)?.dateStr ?? initialDays[0].dateStr;
  });

  const [showPricing, setShowPricing] = useState<boolean>(true);
  const [mode, setMode] = useState<BookingMode>('mock');

  // Google Workspace OAuth state (in-memory only)
  const [googleUser, setGoogleUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isSigningIn, setIsSigningIn] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Slots state
  const [slots, setSlots] = useState<TimeSlotOption[]>([]);
  const [slotsLoading, setSlotsLoading] = useState<boolean>(true);
  const [slotsError, setSlotsError] = useState<string | null>(null);
  const [slotsAuthNeeded, setSlotsAuthNeeded] = useState<boolean>(false);
  const [selectedSlot, setSelectedSlot] = useState<TimeSlotOption | null>(null);

  // Minimal-data booking form state
  const [customerName, setCustomerName] = useState<string>('');
  const [customerPhone, setCustomerPhone] = useState<string>('');
  const [consentAccepted, setConsentAccepted] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [confirmedBooking, setConfirmedBooking] = useState<ConfirmedBooking | null>(null);

  // Modals
  const [policyModalOpen, setPolicyModalOpen] = useState<boolean>(false);
  const [policyTab, setPolicyTab] = useState<PolicyTab>('terms');
  const [setupModalOpen, setSetupModalOpen] = useState<boolean>(false);

  const checkoutRef = useRef<HTMLDivElement | null>(null);

  const selectedService = useMemo(
    () => services.find((s) => s.id === selectedServiceId) ?? services[0],
    [services, selectedServiceId],
  );

  const selectedDayObj = useMemo(
    () => days.find((d) => d.dateStr === selectedDateStr) ?? days[0],
    [days, selectedDateStr],
  );

  const sydneyZoneLabel = useMemo(() => getSydneyZoneLabel(), []);

  // Initialize Firebase Auth listener & studio bootstrap
  useEffect(() => {
    const unsub = initCalendarAuth(
      (user, token) => {
        setGoogleUser(user);
        setAccessToken(token);
      },
      () => {
        setGoogleUser(null);
        setAccessToken(null);
      },
    );

    fetchStudioBootstrap()
      .then((data) => {
        setBootstrap(data);
        setServices(data.services);
        setDays(data.days);
        const firstOpen = data.days.find((d) => d.isOpen);
        if (firstOpen) {
          setSelectedDateStr((prev) =>
            data.days.some((d) => d.dateStr === prev && d.isOpen) ? prev : firstOpen.dateStr,
          );
        }
        if (data.capabilities.defaultMode === 'live') {
          setMode('live');
        }
      })
      .catch(() => {
        // Fallback to static shared config if initial fetch races server startup
      });

    return () => unsub();
  }, []);

  const loadSlots = useCallback(async () => {
    setSlotsLoading(true);
    setSlotsError(null);
    setSlotsAuthNeeded(false);

    try {
      const token = accessToken || getInMemoryAccessToken();
      const data = await fetchAvailableSlots({
        dateStr: selectedDateStr,
        serviceId: selectedServiceId,
        mode,
        accessToken: token,
      });
      setSlots(data.slots);
      setSelectedSlot((prev) => {
        if (!prev) return null;
        const stillAvailable = data.slots.find(
          (s) => s.startUtcMs === prev.startUtcMs && s.available,
        );
        return stillAvailable ?? null;
      });
    } catch (err) {
      if (err instanceof ApiRequestError && (err.status === 401 || err.code === 'AUTH_REQUIRED')) {
        setSlotsAuthNeeded(true);
        setSlots([]);
      } else {
        setSlotsError(err instanceof Error ? err.message : 'Unable to load available times.');
      }
    } finally {
      setSlotsLoading(false);
    }
  }, [selectedDateStr, selectedServiceId, mode, accessToken]);

  useEffect(() => {
    loadSlots();
  }, [loadSlots]);

  const handleGoogleSignIn = async () => {
    setIsSigningIn(true);
    setAuthError(null);
    try {
      const result = await signInWithGoogleCalendar();
      setGoogleUser(result.user);
      setAccessToken(result.accessToken);
      setMode('live');
      setSlotsAuthNeeded(false);
    } catch (err) {
      setAuthError(
        err instanceof Error
          ? err.message
          : 'Google sign-in was cancelled or could not complete.',
      );
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleGoogleSignOut = async () => {
    await signOutGoogleCalendar();
    setGoogleUser(null);
    setAccessToken(null);
    if (!bootstrap?.capabilities.hasServerCredentials) {
      setMode('mock');
    }
  };

  const handleResetMock = async () => {
    await resetMockSchedule();
    setConfirmedBooking(null);
    await loadSlots();
  };

  const openPolicy = (tab: PolicyTab) => {
    setPolicyTab(tab);
    setPolicyModalOpen(true);
  };

  const handleSelectSlot = (slot: TimeSlotOption) => {
    if (!slot.available) return;
    setSelectedSlot(slot);
    setFormError(null);
    setConfirmedBooking(null);
    if (window.innerWidth < 1024 && checkoutRef.current) {
      checkoutRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  };

  const handleReviewBooking = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!selectedSlot) {
      setFormError('Please select an available Sydney time slot first.');
      return;
    }

    const trimmedName = customerName.trim();
    if (trimmedName.length < 2 || trimmedName.length > 80) {
      setFormError('Please enter your name (at least 2 characters).');
      return;
    }

    if (!isValidAustralianMobileClient(customerPhone)) {
      setFormError('Please enter a valid Australian mobile number (e.g. 0412 345 678).');
      return;
    }

    if (!consentAccepted) {
      setFormError(
        'Please confirm that you accept the Booking & Cancellation Terms and APP Privacy Policy.',
      );
      return;
    }

    setConfirmOpen(true);
  };

  const handleFinalConfirm = async () => {
    if (!selectedSlot) return;
    setSubmitting(true);
    setFormError(null);

    try {
      const token = accessToken || getInMemoryAccessToken();
      const booking = await submitBooking({
        name: customerName.trim(),
        phone: customerPhone.trim(),
        serviceId: selectedService.id,
        startUtcMs: selectedSlot.startUtcMs,
        consentAccepted,
        mode,
        accessToken: token,
      });

      setConfirmedBooking(booking);
      setConfirmOpen(false);
      setSelectedSlot(null);
      await loadSlots();
    } catch (err) {
      setConfirmOpen(false);
      if (err instanceof ApiRequestError && err.status === 409) {
        setFormError(err.message);
        setSelectedSlot(null);
        await loadSlots();
      } else if (err instanceof ApiRequestError && err.status === 401) {
        setSlotsAuthNeeded(true);
        setFormError('Google Calendar sign-in is required before booking in Live Mode.');
      } else {
        setFormError(err instanceof Error ? err.message : 'Unable to complete booking.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const groupedSlots = useMemo(() => {
    const groups: Record<'morning' | 'afternoon' | 'evening', TimeSlotOption[]> = {
      morning: [],
      afternoon: [],
      evening: [],
    };
    for (const slot of slots) {
      groups[slot.period].push(slot);
    }
    return groups;
  }, [slots]);

  const availableCount = useMemo(
    () => slots.filter((s) => s.available).length,
    [slots],
  );

  return (
    <div id="top" className="min-h-screen flex flex-col bg-[#F7F6F3] text-[#141413]">
      {/* Strict 3-Zone Top Navigation Bar */}
      <header className="sticky top-0 z-40 h-14 bg-[#F7F6F3]/92 backdrop-blur-md border-b border-stone-200/80">
        <div className="max-w-6xl mx-auto h-full px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-8">
          <a
            href="#top"
            className="font-display text-lg font-bold tracking-tight text-stone-900 whitespace-nowrap shrink-0"
          >
            {STUDIO_INFO.brandName}
          </a>

          <nav
            aria-label="Primary navigation"
            className="hidden md:flex items-center gap-6 text-sm font-medium text-stone-600"
          >
            <a
              href="#services"
              className="hover:text-stone-900 transition-colors whitespace-nowrap shrink-0"
            >
              Services
            </a>
            <a
              href="#book"
              className="hover:text-stone-900 transition-colors whitespace-nowrap shrink-0"
            >
              Book Time
            </a>
            <a
              href="#policies"
              className="hover:text-stone-900 transition-colors whitespace-nowrap shrink-0"
            >
              Policies
            </a>
            <button
              type="button"
              onClick={() => setSetupModalOpen(true)}
              className="hover:text-stone-900 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Cloud Setup
            </button>
          </nav>

          <div className="flex items-center shrink-0">
            <a
              href="#book"
              className="min-h-[40px] px-4 py-2 rounded-xl bg-[#1E3A2F] text-white text-xs sm:text-sm font-semibold hover:bg-[#162C23] transition-colors inline-flex items-center whitespace-nowrap shrink-0"
            >
              Book Cut
            </a>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero Split */}
        <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-8 lg:pt-10 lg:pb-12">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-10 items-stretch">
            <div className="lg:col-span-6 flex flex-col justify-center space-y-5">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs sm:text-sm text-stone-600">
                <span>{STUDIO_INFO.suburb}</span>
                <span aria-hidden="true">·</span>
                <span>{sydneyZoneLabel}</span>
                <span aria-hidden="true">·</span>
                <span>IG {STUDIO_INFO.instagramHandle}</span>
              </div>

              <h1 className="font-display text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-stone-900 leading-[1.08] text-balance">
                Sharp cuts in Surry Hills, booked in thirty seconds.
              </h1>

              <p className="text-sm sm:text-base text-stone-600 leading-relaxed max-w-xl">
                Built for quick mobile booking straight from Instagram and TikTok. Pick your cut,
                choose a live {STUDIO_INFO.timezone} chair time, and lock your spot with zero
                deposit.
              </p>

              <div className="flex flex-wrap items-center gap-4 pt-1">
                <a
                  href="#services"
                  className="min-h-[48px] px-6 py-3 rounded-xl bg-[#1E3A2F] text-white text-sm font-semibold hover:bg-[#162C23] transition-colors inline-flex items-center justify-center whitespace-nowrap shrink-0"
                >
                  Choose Your Cut
                </a>
                <button
                  type="button"
                  onClick={() => openPolicy('terms')}
                  className="min-h-[44px] px-2 py-2 text-sm font-medium text-stone-700 hover:text-stone-900 underline underline-offset-4 decoration-stone-300 hover:decoration-stone-600 transition-colors whitespace-nowrap shrink-0"
                >
                  Booking &amp; Privacy Terms
                </button>
              </div>
            </div>

            <div className="lg:col-span-6">
              <div className="h-full rounded-2xl overflow-hidden border border-stone-200 bg-stone-200 aspect-4/3 lg:aspect-auto">
                <StudioImage
                  src={HERO_IMAGE}
                  alt="Crown & Clipper men's barber studio interior in Surry Hills, Sydney"
                  fallbackTitle="Crown & Clipper · Surry Hills Studio"
                  className="w-full h-full object-cover"
                />
              </div>
            </div>
          </div>
        </section>

        {/* Booking Workspace */}
        <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pb-14">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Left Column: Service Selection + Sydney Date & Real-Time Slots */}
            <div className="lg:col-span-7 space-y-8">
              {/* 01. Services */}
              <div id="services" className="scroll-mt-20 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="font-display text-xl sm:text-2xl font-bold text-stone-900">
                      01. Select Service
                    </h2>
                    <p className="text-xs sm:text-sm text-stone-600 mt-0.5">
                      Durations include consultation and hot towel finish.
                    </p>
                  </div>

                  <div className="inline-flex items-center gap-1 p-1 bg-stone-200/70 rounded-xl">
                    <button
                      type="button"
                      onClick={() => setShowPricing(true)}
                      className={`min-h-[36px] px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                        showPricing
                          ? 'bg-white text-stone-900 shadow-xs'
                          : 'text-stone-600 hover:text-stone-900'
                      }`}
                    >
                      AUD Pricing
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowPricing(false)}
                      className={`min-h-[36px] px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                        !showPricing
                          ? 'bg-white text-stone-900 shadow-xs'
                          : 'text-stone-600 hover:text-stone-900'
                      }`}
                    >
                      Duration Only
                    </button>
                  </div>
                </div>

                <div className="bg-white rounded-2xl border border-stone-200 divide-y divide-stone-100 overflow-hidden">
                  {services.map((service) => {
                    const active = service.id === selectedServiceId;
                    return (
                      <button
                        key={service.id}
                        type="button"
                        onClick={() => {
                          setSelectedServiceId(service.id);
                          setConfirmedBooking(null);
                        }}
                        aria-pressed={active}
                        className={`w-full text-left px-4 sm:px-5 py-4 transition-colors flex items-start justify-between gap-4 cursor-pointer min-h-[68px] ${
                          active
                            ? 'bg-[#1E3A2F]/[0.06] ring-1 ring-inset ring-[#1E3A2F]'
                            : 'hover:bg-stone-50'
                        }`}
                      >
                        <div className="space-y-1 min-w-0">
                          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                            <span className="font-semibold text-base text-stone-900">
                              {service.name}
                            </span>
                            {service.popular && (
                              <span className="text-xs font-medium text-[#8C6229]">
                                · Most booked
                              </span>
                            )}
                          </div>
                          <p className="text-xs sm:text-sm text-stone-600 leading-relaxed">
                            {service.description}
                          </p>
                        </div>

                        <div className="shrink-0 text-right space-y-0.5 pt-0.5">
                          {showPricing && (
                            <div className="font-mono tabular-nums text-sm sm:text-base font-semibold text-stone-900">
                              ${service.priceAud} <span className="text-xs font-normal text-stone-500">AUD</span>
                            </div>
                          )}
                          <div className="font-mono tabular-nums text-xs text-stone-500">
                            {service.durationMin} min
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 02. Sydney Date & Real-Time Slots */}
              <div id="book" className="scroll-mt-20 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="font-display text-xl sm:text-2xl font-bold text-stone-900">
                      02. Pick Day &amp; Time
                    </h2>
                    <p className="text-xs sm:text-sm text-stone-600 mt-0.5">
                      All times displayed in {sydneyZoneLabel}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="inline-flex items-center gap-1 p-1 bg-stone-200/70 rounded-xl">
                      <button
                        type="button"
                        onClick={() => setMode('mock')}
                        className={`min-h-[36px] px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                          mode === 'mock'
                            ? 'bg-white text-stone-900 shadow-xs'
                            : 'text-stone-600 hover:text-stone-900'
                        }`}
                      >
                        Mock Mode
                      </button>
                      <button
                        type="button"
                        onClick={() => setMode('live')}
                        className={`min-h-[36px] px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                          mode === 'live'
                            ? 'bg-white text-stone-900 shadow-xs'
                            : 'text-stone-600 hover:text-stone-900'
                        }`}
                      >
                        Live Calendar
                      </button>
                    </div>
                  </div>
                </div>

                {/* Horizontal 14-day Sydney Date Scroller */}
                <div
                  className="flex items-stretch gap-2 overflow-x-auto pb-1 -mx-4 px-4 sm:mx-0 sm:px-0"
                  role="listbox"
                  aria-label="Select appointment date in Sydney time"
                >
                  {days.map((day) => {
                    const selected = day.dateStr === selectedDateStr;
                    return (
                      <button
                        key={day.dateStr}
                        type="button"
                        role="option"
                        aria-selected={selected}
                        onClick={() => {
                          setSelectedDateStr(day.dateStr);
                          setSelectedSlot(null);
                          setConfirmedBooking(null);
                        }}
                        className={`min-w-[66px] min-h-[70px] px-3 py-2.5 rounded-xl border text-center flex flex-col items-center justify-center gap-0.5 transition-colors shrink-0 cursor-pointer ${
                          selected
                            ? 'bg-[#1E3A2F] border-[#1E3A2F] text-white'
                            : day.isOpen
                              ? 'bg-white border-stone-200 text-stone-900 hover:border-stone-400'
                              : 'bg-stone-100 border-stone-200 text-stone-400 hover:border-stone-300'
                        }`}
                      >
                        <span
                          className={`text-[11px] font-medium ${
                            selected ? 'text-stone-200' : 'text-stone-500'
                          }`}
                        >
                          {day.isToday ? 'Today' : day.weekdayShort}
                        </span>
                        <span className="font-display text-lg font-bold tabular-nums leading-tight">
                          {day.dayNumber}
                        </span>
                        <span
                          className={`text-[11px] ${
                            selected ? 'text-stone-200' : 'text-stone-500'
                          }`}
                        >
                          {day.isOpen ? day.monthShort : 'Closed'}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Slots Panel */}
                <div className="bg-white rounded-2xl border border-stone-200 p-4 sm:p-5 space-y-5">
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-stone-100">
                    <div className="text-sm font-medium text-stone-900">
                      {selectedDayObj.weekdayShort}, {selectedDayObj.dayNumber} {selectedDayObj.monthShort}
                      <span className="text-stone-400 font-normal"> · </span>
                      <span className="text-stone-600 font-normal">
                        {selectedDayObj.isOpen
                          ? `${availableCount} open for ${selectedService.durationMin}m`
                          : 'Studio closed Mondays'}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={loadSlots}
                      disabled={slotsLoading}
                      className="min-h-[36px] inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-stone-600 hover:text-stone-900 hover:bg-stone-100 transition-colors disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${slotsLoading ? 'animate-spin' : ''}`} />
                      <span>Refresh</span>
                    </button>
                  </div>

                  {slotsAuthNeeded ? (
                    <div className="py-6 px-4 text-center space-y-4">
                      <div className="space-y-1.5 max-w-md mx-auto">
                        <h3 className="font-semibold text-base text-stone-900">
                          Connect Google Calendar for Live Availability
                        </h3>
                        <p className="text-xs sm:text-sm text-stone-600 leading-relaxed">
                          Sign in with the barber&apos;s Google account to read real-time busy
                          blocks and create confirmed events, or use Mock Mode to preview instantly.
                        </p>
                      </div>

                      {authError && (
                        <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2 max-w-md mx-auto">
                          {authError}
                        </p>
                      )}

                      <div className="flex flex-wrap items-center justify-center gap-3">
                        <button
                          type="button"
                          disabled={isSigningIn}
                          onClick={handleGoogleSignIn}
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
                              {isSigningIn ? 'Connecting...' : 'Sign in with Google'}
                            </span>
                            <span style={{ display: 'none' }}>Sign in with Google</span>
                          </div>
                        </button>

                        <button
                          type="button"
                          onClick={() => setMode('mock')}
                          className="min-h-[44px] px-4 py-2 rounded-full border border-stone-300 text-xs font-medium text-stone-700 hover:bg-stone-50 transition-colors"
                        >
                          Use Mock Mode Instead
                        </button>
                      </div>
                    </div>
                  ) : slotsLoading ? (
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5" aria-busy="true">
                      {Array.from({ length: 8 }).map((_, idx) => (
                        <div
                          key={idx}
                          className="h-11 rounded-xl bg-stone-100 animate-pulse"
                        />
                      ))}
                    </div>
                  ) : slotsError ? (
                    <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-sm text-red-800 flex flex-wrap items-center justify-between gap-3">
                      <span>{slotsError}</span>
                      <button
                        type="button"
                        onClick={loadSlots}
                        className="min-h-[36px] px-3 py-1.5 rounded-lg bg-white border border-red-200 text-xs font-medium text-red-800 hover:bg-red-100 transition-colors"
                      >
                        Try Again
                      </button>
                    </div>
                  ) : !selectedDayObj.isOpen ? (
                    <div className="py-8 text-center space-y-2">
                      <p className="font-medium text-stone-900">Closed on Mondays</p>
                      <p className="text-xs text-stone-500">
                        Liam is in the chair Tuesday through Sunday. Pick another day above.
                      </p>
                    </div>
                  ) : availableCount === 0 ? (
                    <div className="py-8 text-center space-y-2">
                      <p className="font-medium text-stone-900">Fully booked on this day</p>
                      <p className="text-xs text-stone-500">
                        No {selectedService.durationMin}-minute gaps remain. Try another day or a
                        shorter service.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-5">
                      {(['morning', 'afternoon', 'evening'] as const).map((period) => {
                        const periodSlots = groupedSlots[period];
                        if (periodSlots.length === 0) return null;
                        const label =
                          period === 'morning'
                            ? 'Morning'
                            : period === 'afternoon'
                              ? 'Afternoon'
                              : 'Evening';

                        return (
                          <div key={period} className="space-y-2.5">
                            <h3 className="text-xs font-semibold tracking-wide text-stone-500">
                              {label}
                            </h3>
                            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
                              {periodSlots.map((slot) => {
                                const isSelected = selectedSlot?.startUtcMs === slot.startUtcMs;
                                return (
                                  <button
                                    key={slot.startUtcMs}
                                    type="button"
                                    disabled={!slot.available}
                                    onClick={() => handleSelectSlot(slot)}
                                    aria-label={
                                      slot.available
                                        ? `${slot.timeLabel} Sydney time, available`
                                        : `${slot.timeLabel} Sydney time, unavailable`
                                    }
                                    className={`min-h-[44px] px-2.5 py-2 rounded-xl border text-sm font-mono tabular-nums transition-colors whitespace-nowrap ${
                                      isSelected
                                        ? 'bg-[#1E3A2F] border-[#1E3A2F] text-white font-semibold'
                                        : slot.available
                                          ? 'bg-white border-stone-200 text-stone-900 hover:border-stone-500 cursor-pointer'
                                          : 'bg-stone-50 border-stone-100 text-stone-400 line-through cursor-not-allowed'
                                    }`}
                                  >
                                    {slot.timeLabel}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Right Column: Minimal-Data Checkout & Confirmation */}
            <div ref={checkoutRef} className="lg:col-span-5 lg:sticky lg:top-20">
              {confirmedBooking ? (
                <div className="bg-white rounded-2xl border border-stone-200 p-6 space-y-5 shadow-xs">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="w-6 h-6 text-[#1E3A2F] shrink-0 mt-0.5" />
                    <div>
                      <h2 className="font-display text-xl font-bold text-stone-900">
                        You&apos;re Booked In
                      </h2>
                      <p className="text-xs sm:text-sm text-stone-600 mt-0.5">
                        {confirmedBooking.mode === 'live'
                          ? 'Confirmed in Google Calendar. See you in Surry Hills.'
                          : 'Reserved in Mock Mode. Connect Google Calendar in Cloud Setup for live events.'}
                      </p>
                    </div>
                  </div>

                  <dl className="divide-y divide-stone-100 border border-stone-200 rounded-xl bg-stone-50 text-sm">
                    <div className="px-4 py-3 flex justify-between gap-4">
                      <dt className="text-stone-500">Service</dt>
                      <dd className="font-medium text-stone-900 text-right">
                        {confirmedBooking.serviceName} ({confirmedBooking.durationMin} min)
                      </dd>
                    </div>
                    {showPricing && (
                      <div className="px-4 py-3 flex justify-between gap-4">
                        <dt className="text-stone-500">Pay in studio</dt>
                        <dd className="font-mono tabular-nums font-medium text-stone-900">
                          ${confirmedBooking.priceAud} AUD
                        </dd>
                      </div>
                    )}
                    <div className="px-4 py-3 flex justify-between gap-4">
                      <dt className="text-stone-500">When (Sydney)</dt>
                      <dd className="font-medium text-stone-900 text-right tabular-nums">
                        {formatSydneyDateLong(confirmedBooking.startUtcMs)} · {confirmedBooking.timeLabel}
                      </dd>
                    </div>
                    <div className="px-4 py-3 flex justify-between gap-4">
                      <dt className="text-stone-500">Client</dt>
                      <dd className="font-medium text-stone-900 text-right">
                        {confirmedBooking.customerName}
                      </dd>
                    </div>
                    <div className="px-4 py-3 flex justify-between gap-4">
                      <dt className="text-stone-500">Mobile</dt>
                      <dd className="font-mono tabular-nums text-stone-900 text-right">
                        {confirmedBooking.customerPhone}
                      </dd>
                    </div>
                    <div className="px-4 py-3 flex justify-between gap-4">
                      <dt className="text-stone-500">Location</dt>
                      <dd className="text-stone-900 text-right">{STUDIO_INFO.address}</dd>
                    </div>
                  </dl>

                  <div className="space-y-2.5">
                    <button
                      type="button"
                      onClick={() => downloadBookingIcs(confirmedBooking)}
                      className="w-full min-h-[48px] px-4 py-3 rounded-xl bg-[#1E3A2F] text-white text-sm font-semibold hover:bg-[#162C23] transition-colors flex items-center justify-center gap-2"
                    >
                      <CalendarPlus className="w-4 h-4" />
                      <span>Add to Phone Calendar (.ics)</span>
                    </button>

                    {confirmedBooking.htmlLink && (
                      <a
                        href={confirmedBooking.htmlLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full min-h-[44px] px-4 py-2.5 rounded-xl border border-stone-300 text-sm font-medium text-stone-800 hover:bg-stone-50 transition-colors flex items-center justify-center gap-2"
                      >
                        <span>View Google Calendar Event</span>
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    )}

                    <button
                      type="button"
                      onClick={() => setConfirmedBooking(null)}
                      className="w-full min-h-[44px] px-4 py-2.5 rounded-xl text-sm font-medium text-stone-600 hover:text-stone-900 hover:bg-stone-100 transition-colors"
                    >
                      Book Another Appointment
                    </button>
                  </div>
                </div>
              ) : (
                <form
                  onSubmit={handleReviewBooking}
                  className="bg-white rounded-2xl border border-stone-200 p-5 sm:p-6 space-y-5 shadow-xs"
                  noValidate
                >
                  <div>
                    <h2 className="font-display text-xl font-bold text-stone-900">
                      03. Your Details
                    </h2>
                    <p className="text-xs sm:text-sm text-stone-600 mt-0.5">
                      We only ask for your name and mobile number—no account or email needed.
                    </p>
                  </div>

                  {/* Selected Summary */}
                  <div className="rounded-xl bg-stone-50 border border-stone-200/90 p-4 space-y-2 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-semibold text-stone-900">{selectedService.name}</span>
                      <span className="font-mono tabular-nums text-stone-900 font-medium">
                        {showPricing ? `$${selectedService.priceAud} AUD · ` : ''}
                        {selectedService.durationMin}m
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-stone-600">
                      <Calendar className="w-3.5 h-3.5 text-stone-500 shrink-0" />
                      <span>
                        {selectedSlot
                          ? `${selectedDayObj.weekdayShort}, ${selectedDayObj.dayNumber} ${selectedDayObj.monthShort} at ${selectedSlot.timeLabel} (${STUDIO_INFO.timezone})`
                          : 'Select an open time slot to continue'}
                      </span>
                    </div>
                  </div>

                  {/* Minimal Fields */}
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <label htmlFor="client-name" className="block text-sm font-medium text-stone-800">
                        Your Name
                      </label>
                      <input
                        id="client-name"
                        type="text"
                        autoComplete="name"
                        maxLength={80}
                        placeholder="e.g. Jack Thompson"
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                        className="w-full min-h-[48px] px-3.5 py-2.5 rounded-xl border border-stone-300 bg-white text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-[#1E3A2F] focus:border-[#1E3A2F]"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label htmlFor="client-phone" className="block text-sm font-medium text-stone-800">
                        Australian Mobile Number
                      </label>
                      <input
                        id="client-phone"
                        type="tel"
                        inputMode="tel"
                        autoComplete="tel"
                        maxLength={20}
                        placeholder="0412 345 678"
                        value={customerPhone}
                        onChange={(e) => setCustomerPhone(e.target.value)}
                        className="w-full min-h-[48px] px-3.5 py-2.5 rounded-xl border border-stone-300 bg-white text-sm font-mono tabular-nums text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-[#1E3A2F] focus:border-[#1E3A2F]"
                      />
                      <p className="text-xs text-stone-500">
                        Used only for booking confirmation or urgent schedule changes.
                      </p>
                    </div>
                  </div>

                  {/* Explicit Consent Notice */}
                  <div className="pt-1">
                    <label className="flex items-start gap-3 cursor-pointer min-h-[44px]">
                      <input
                        type="checkbox"
                        checked={consentAccepted}
                        onChange={(e) => setConsentAccepted(e.target.checked)}
                        className="mt-1 h-5 w-5 rounded border-stone-300 text-[#1E3A2F] focus:ring-[#1E3A2F] shrink-0"
                      />
                      <span className="text-xs leading-relaxed text-stone-600">
                        I agree to the{' '}
                        <button
                          type="button"
                          onClick={() => openPolicy('terms')}
                          className="font-medium text-stone-900 underline underline-offset-2"
                        >
                          Booking &amp; Cancellation Terms
                        </button>{' '}
                        ({STUDIO_INFO.cancellationWindowHours}h notice) and consent to{' '}
                        {STUDIO_INFO.brandName} collecting my name, mobile, service, and time per the{' '}
                        <button
                          type="button"
                          onClick={() => openPolicy('privacy')}
                          className="font-medium text-stone-900 underline underline-offset-2"
                        >
                          APP Privacy Policy
                        </button>
                        .
                      </span>
                    </label>
                  </div>

                  {formError && (
                    <div
                      role="alert"
                      className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs sm:text-sm text-red-800"
                    >
                      {formError}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full min-h-[48px] px-5 py-3.5 rounded-xl bg-[#1E3A2F] text-white text-sm font-semibold hover:bg-[#162C23] transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Checking Availability...</span>
                      </>
                    ) : (
                      <span>Review &amp; Confirm Booking</span>
                    )}
                  </button>
                </form>
              )}
            </div>
          </div>
        </section>

        {/* Barber & Lookbook Strip */}
        <section className="border-t border-stone-200 bg-white">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-16">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-center">
              <div className="md:col-span-5 flex items-center gap-5">
                <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl overflow-hidden border border-stone-200 shrink-0">
                  <StudioImage
                    src={BARBER_IMAGE}
                    alt={`${STUDIO_INFO.barberName}, ${STUDIO_INFO.barberRole} in Sydney`}
                    fallbackTitle={STUDIO_INFO.barberName}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="space-y-1.5">
                  <div className="text-xs text-stone-500">
                    {STUDIO_INFO.barberRole} · Surry Hills
                  </div>
                  <h2 className="font-display text-xl font-bold text-stone-900">
                    {STUDIO_INFO.barberName}
                  </h2>
                  <p className="text-sm text-stone-600 leading-relaxed">
                    Zero-rush appointments on Crown Street. Follow fresh fades and shear work on{' '}
                    <span className="font-medium text-stone-900">{STUDIO_INFO.instagramHandle}</span>{' '}
                    and TikTok{' '}
                    <span className="font-medium text-stone-900">{STUDIO_INFO.tiktokHandle}</span>.
                  </p>
                </div>
              </div>

              <div className="md:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-6 items-center">
                <div className="rounded-2xl overflow-hidden border border-stone-200 aspect-4/3">
                  <StudioImage
                    src={FADE_IMAGE}
                    alt="Low skin fade and textured crop cut at Crown & Clipper Sydney"
                    fallbackTitle="Low Skin Fade · Textured Crop"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="space-y-3 text-sm text-stone-600">
                  <div className="flex items-start gap-2.5">
                    <MapPin className="w-4 h-4 text-stone-500 shrink-0 mt-0.5" />
                    <span>{STUDIO_INFO.address}</span>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <Clock className="w-4 h-4 text-stone-500 shrink-0 mt-0.5" />
                    <div>
                      <div>Tue–Fri: 9:00 am – 7:00 pm</div>
                      <div>Sat: 8:30 am – 5:30 pm · Sun: 10:00 am – 3:30 pm</div>
                    </div>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <Instagram className="w-4 h-4 text-stone-500 shrink-0 mt-0.5" />
                    <span>
                      DM {STUDIO_INFO.instagramHandle} for same-day changes
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Fair Terms & APP Privacy Section */}
        <section id="policies" className="scroll-mt-20 border-t border-stone-200 bg-[#F7F6F3]">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-16">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-12">
              <div className="space-y-3">
                <h2 className="font-display text-xl font-bold text-stone-900">
                  Fair Booking &amp; Cancellation Terms
                </h2>
                <p className="text-sm text-stone-600 leading-relaxed">
                  No upfront deposit is required. You can reschedule or cancel free of charge up
                  to {STUDIO_INFO.cancellationWindowHours} hours before your appointment in
                  Australia/Sydney time. We hold every seat for {STUDIO_INFO.gracePeriodMinutes}{' '}
                  minutes; first-time late cancellations are always waived.
                </p>
                <button
                  type="button"
                  onClick={() => openPolicy('terms')}
                  className="min-h-[40px] text-sm font-medium text-[#1E3A2F] hover:underline underline-offset-4"
                >
                  Read full booking terms
                </button>
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-[#1E3A2F]" aria-hidden="true" />
                  <h2 className="font-display text-xl font-bold text-stone-900">
                    Privacy Policy (Australian Privacy Principles)
                  </h2>
                </div>
                <p className="text-sm text-stone-600 leading-relaxed">
                  In line with the <em>Privacy Act 1988 (Cth)</em> and APP 3 data minimization, we
                  collect only your name, Australian mobile number, selected service, and slot time.
                  Your details are used solely to schedule your Google Calendar appointment and are
                  never shared or used for marketing.
                </p>
                <button
                  type="button"
                  onClick={() => openPolicy('privacy')}
                  className="min-h-[40px] text-sm font-medium text-[#1E3A2F] hover:underline underline-offset-4"
                >
                  Read full APP privacy notice
                </button>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Quiet Footer */}
      <footer className="border-t border-stone-200 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs text-stone-500">
          <div>
            {STUDIO_INFO.brandName} · {STUDIO_INFO.suburb} · {STUDIO_INFO.timezone}
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={() => openPolicy('terms')}
              className="hover:text-stone-900 transition-colors"
            >
              Cancellation Terms
            </button>
            <button
              type="button"
              onClick={() => openPolicy('privacy')}
              className="hover:text-stone-900 transition-colors"
            >
              APP Privacy Policy
            </button>
            <button
              type="button"
              onClick={() => setSetupModalOpen(true)}
              className="inline-flex items-center gap-1.5 font-medium text-stone-700 hover:text-stone-900 transition-colors"
            >
              <Server className="w-3.5 h-3.5" />
              <span>Barber Calendar &amp; Cloud Run Setup</span>
            </button>
          </div>
        </div>
      </footer>

      <BookingConfirmModal
        open={confirmOpen}
        service={selectedService}
        dateLabel={`${selectedDayObj.weekdayShort}, ${selectedDayObj.dayNumber} ${selectedDayObj.monthShort}`}
        timeLabel={selectedSlot?.timeLabel ?? ''}
        customerName={customerName.trim()}
        customerPhone={customerPhone.trim()}
        mode={mode}
        submitting={submitting}
        showPrice={showPricing}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={handleFinalConfirm}
      />

      <PolicyModal
        open={policyModalOpen}
        activeTab={policyTab}
        onTabChange={setPolicyTab}
        onClose={() => setPolicyModalOpen(false)}
      />

      <CloudSetupModal
        open={setupModalOpen}
        onClose={() => setSetupModalOpen(false)}
        mode={mode}
        onModeChange={setMode}
        capabilities={bootstrap?.capabilities ?? null}
        googleUser={googleUser}
        hasToken={Boolean(accessToken)}
        isSigningIn={isSigningIn}
        authError={authError}
        onGoogleSignIn={handleGoogleSignIn}
        onGoogleSignOut={handleGoogleSignOut}
        onResetMock={handleResetMock}
      />
    </div>
  );
}

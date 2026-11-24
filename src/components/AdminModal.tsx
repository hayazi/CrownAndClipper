import { Eye, EyeOff, Loader2, Lock, LogOut, Pencil, Plus, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type { BarberService } from '../../shared/services';
import {
  ApiRequestError,
  bootstrapAdmin,
  createAdminService,
  fetchAdminServices,
  fetchAdminStatus,
  loginAdmin,
  updateAdminService,
  type AdminAuthStatusResponse,
  type AdminSessionResponse,
  type ServiceFormPayload,
} from '../lib/bookingApi';

interface AdminModalProps {
  open: boolean;
  onClose: () => void;
  session: AdminSessionResponse | null;
  onSessionChange: (session: AdminSessionResponse | null) => void;
  onPublicServicesUpdated: (publicServices: BarberService[]) => void;
}

const DURATION_OPTIONS = [15, 30, 45, 60, 75, 90, 120];

const EMPTY_FORM: ServiceFormPayload = {
  name: '',
  durationMin: 45,
  priceAud: 65,
  description: '',
  popular: false,
  active: true,
};

export function AdminModal({
  open,
  onClose,
  session,
  onSessionChange,
  onPublicServicesUpdated,
}: AdminModalProps) {
  const [authStatus, setAuthStatus] = useState<AdminAuthStatusResponse | null>(null);
  const [statusLoading, setStatusLoading] = useState<boolean>(false);

  // Login / First-run setup form
  const [username, setUsername] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [authSubmitting, setAuthSubmitting] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Admin Services CRUD
  const [adminServices, setAdminServices] = useState<BarberService[]>([]);
  const [servicesLoading, setServicesLoading] = useState<boolean>(false);
  const [servicesError, setServicesError] = useState<string | null>(null);

  const [editorMode, setEditorMode] = useState<'none' | 'create' | 'edit'>('none');
  const [editingServiceId, setEditingServiceId] = useState<string | null>(null);
  const [formState, setFormState] = useState<ServiceFormPayload>(EMPTY_FORM);
  const [savingService, setSavingService] = useState<boolean>(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const loadStatusAndServices = useCallback(async () => {
    setStatusLoading(true);
    setAuthError(null);
    try {
      const status = await fetchAdminStatus();
      setAuthStatus(status);

      if (session) {
        setServicesLoading(true);
        try {
          const list = await fetchAdminServices(session.token);
          setAdminServices(list);
          setServicesError(null);
        } catch (err) {
          if (err instanceof ApiRequestError && err.status === 401) {
            onSessionChange(null);
          } else {
            setServicesError(err instanceof Error ? err.message : 'Unable to load services.');
          }
        } finally {
          setServicesLoading(false);
        }
      }
    } catch {
      setAuthError('Unable to reach server admin status.');
    } finally {
      setStatusLoading(false);
    }
  }, [session, onSessionChange]);

  useEffect(() => {
    if (!open) return;
    loadStatusAndServices();
  }, [open, loadStatusAndServices]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const handleBootstrapSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);

    if (username.trim().length < 2) {
      setAuthError('Enter a username (at least 2 characters).');
      return;
    }
    if (password.length < 8) {
      setAuthError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setAuthError('Passwords do not match.');
      return;
    }

    setAuthSubmitting(true);
    try {
      const newSession = await bootstrapAdmin({
        username: username.trim(),
        password,
      });
      setPassword('');
      setConfirmPassword('');
      onSessionChange(newSession);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Setup failed.');
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    if (!username.trim() || !password) {
      setAuthError('Enter both username and password.');
      return;
    }

    setAuthSubmitting(true);
    try {
      const newSession = await loginAdmin({
        username: username.trim(),
        password,
      });
      setPassword('');
      onSessionChange(newSession);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Sign-in failed.');
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleSignOut = () => {
    onSessionChange(null);
    setAdminServices([]);
    setEditorMode('none');
    setSaveMessage(null);
  };

  const openCreateForm = () => {
    setEditorMode('create');
    setEditingServiceId(null);
    setFormState(EMPTY_FORM);
    setServicesError(null);
    setSaveMessage(null);
  };

  const openEditForm = (service: BarberService) => {
    setEditorMode('edit');
    setEditingServiceId(service.id);
    setFormState({
      name: service.name,
      durationMin: service.durationMin,
      priceAud: service.priceAud,
      description: service.description,
      popular: Boolean(service.popular),
      active: service.active !== false,
    });
    setServicesError(null);
    setSaveMessage(null);
  };

  const handleSaveService = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session) return;

    setServicesError(null);
    setSaveMessage(null);
    setSavingService(true);

    try {
      const result =
        editorMode === 'create'
          ? await createAdminService(session.token, formState)
          : await updateAdminService(session.token, editingServiceId!, formState);

      setAdminServices(result.services);
      onPublicServicesUpdated(result.publicServices);
      setSaveMessage(
        editorMode === 'create' ? 'New service added to booking menu.' : 'Service updated.',
      );
      setEditorMode('none');
      setEditingServiceId(null);
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 401) {
        onSessionChange(null);
        setAuthError('Your admin session expired. Please sign in again.');
      } else {
        setServicesError(err instanceof Error ? err.message : 'Unable to save service.');
      }
    } finally {
      setSavingService(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-xs p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-modal-title"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-3xl max-h-[92vh] overflow-y-auto bg-white rounded-t-3xl sm:rounded-2xl border border-stone-200 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sm:hidden w-10 h-1.5 bg-stone-300 rounded-full mx-auto mt-3" />

        <div className="sticky top-0 z-10 bg-white/95 backdrop-blur-sm border-b border-stone-200 px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <Lock className="w-5 h-5 text-[#1E3A2F]" aria-hidden="true" />
            <h2 id="admin-modal-title" className="font-display text-lg font-semibold text-stone-900">
              Studio Admin — Services
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-stone-600 hover:text-stone-900 hover:bg-stone-100 transition-colors"
            aria-label="Close admin panel"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6">
          {statusLoading && !authStatus ? (
            <div className="py-10 flex items-center justify-center gap-2 text-sm text-stone-600">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Checking admin status...</span>
            </div>
          ) : !session ? (
            authStatus?.source === 'unclaimed' ? (
              /* First-Run Admin Setup / Claim Form */
              <form onSubmit={handleBootstrapSubmit} className="max-w-md mx-auto space-y-4">
                <div className="space-y-1">
                  <h3 className="font-display text-lg font-bold text-stone-900">
                    First-Run Admin Setup
                  </h3>
                  <p className="text-xs sm:text-sm text-stone-600 leading-relaxed">
                    No admin credentials are configured in environment secrets yet. Create the
                    studio administrator account once below (you can override this anytime via{' '}
                    <code className="font-mono">ADMIN_USERNAME</code> and{' '}
                    <code className="font-mono">ADMIN_PASSWORD</code>).
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="setup-admin-user" className="block text-sm font-medium text-stone-800">
                    Admin Username
                  </label>
                  <input
                    id="setup-admin-user"
                    type="text"
                    autoComplete="username"
                    placeholder="admin"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full min-h-[48px] px-3.5 py-2.5 rounded-xl border border-stone-300 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-[#1E3A2F]"
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="setup-admin-pass" className="block text-sm font-medium text-stone-800">
                    Admin Password
                  </label>
                  <div className="relative">
                    <input
                      id="setup-admin-pass"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      placeholder="Minimum 8 characters"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full min-h-[48px] pl-3.5 pr-12 py-2.5 rounded-xl border border-stone-300 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-[#1E3A2F]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-1 top-1 min-h-[40px] min-w-[40px] flex items-center justify-center text-stone-500 hover:text-stone-900"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="setup-admin-confirm" className="block text-sm font-medium text-stone-800">
                    Confirm Password
                  </label>
                  <input
                    id="setup-admin-confirm"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full min-h-[48px] px-3.5 py-2.5 rounded-xl border border-stone-300 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-[#1E3A2F]"
                  />
                </div>

                {authError && (
                  <p role="alert" className="text-xs sm:text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3.5 py-2.5">
                    {authError}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={authSubmitting}
                  className="w-full min-h-[48px] px-5 py-3 rounded-xl bg-[#1E3A2F] text-white text-sm font-semibold hover:bg-[#162C23] transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  {authSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Saving Credentials...</span>
                    </>
                  ) : (
                    <span>Set Admin Credentials &amp; Open Panel</span>
                  )}
                </button>
              </form>
            ) : (
              /* Standard Server-Verified Sign-In Form */
              <form onSubmit={handleLoginSubmit} className="max-w-md mx-auto space-y-4">
                <div className="space-y-1">
                  <h3 className="font-display text-lg font-bold text-stone-900">
                    Sign In to Manage Services
                  </h3>
                  <p className="text-xs sm:text-sm text-stone-600">
                    Create new cuts or update durations, AUD pricing, and availability.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="login-admin-user" className="block text-sm font-medium text-stone-800">
                    Username
                  </label>
                  <input
                    id="login-admin-user"
                    type="text"
                    autoComplete="username"
                    placeholder="admin"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full min-h-[48px] px-3.5 py-2.5 rounded-xl border border-stone-300 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-[#1E3A2F]"
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="login-admin-pass" className="block text-sm font-medium text-stone-800">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      id="login-admin-pass"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full min-h-[48px] pl-3.5 pr-12 py-2.5 rounded-xl border border-stone-300 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-[#1E3A2F]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-1 top-1 min-h-[40px] min-w-[40px] flex items-center justify-center text-stone-500 hover:text-stone-900"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {authError && (
                  <p role="alert" className="text-xs sm:text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3.5 py-2.5">
                    {authError}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={authSubmitting}
                  className="w-full min-h-[48px] px-5 py-3 rounded-xl bg-[#1E3A2F] text-white text-sm font-semibold hover:bg-[#162C23] transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  {authSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Verifying...</span>
                    </>
                  ) : (
                    <span>Sign In</span>
                  )}
                </button>
              </form>
            )
          ) : (
            /* Authenticated Admin Service Manager */
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-stone-200">
                <div className="text-sm text-stone-600">
                  Signed in as <span className="font-semibold text-stone-900">{session.username}</span>
                  <span aria-hidden="true"> · </span>
                  <span className="tabular-nums">{adminServices.length} services</span>
                </div>

                <div className="flex items-center gap-2">
                  {editorMode === 'none' && (
                    <button
                      type="button"
                      onClick={openCreateForm}
                      className="min-h-[44px] px-4 py-2 rounded-xl bg-[#1E3A2F] text-white text-xs sm:text-sm font-semibold hover:bg-[#162C23] transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
                    >
                      <Plus className="w-4 h-4" />
                      <span>New Service</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="min-h-[44px] px-3.5 py-2 rounded-xl border border-stone-300 text-xs sm:text-sm font-medium text-stone-700 hover:bg-stone-50 transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Sign Out</span>
                  </button>
                </div>
              </div>

              {saveMessage && (
                <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs sm:text-sm text-emerald-900">
                  {saveMessage}
                </div>
              )}

              {servicesError && (
                <div role="alert" className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs sm:text-sm text-red-800">
                  {servicesError}
                </div>
              )}

              {editorMode !== 'none' ? (
                <form onSubmit={handleSaveService} className="space-y-4">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-display text-base font-bold text-stone-900">
                      {editorMode === 'create' ? 'Create New Service' : 'Update Service'}
                    </h3>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="sm:col-span-2 space-y-1.5">
                      <label htmlFor="svc-name" className="block text-sm font-medium text-stone-800">
                        Service Name
                      </label>
                      <input
                        id="svc-name"
                        type="text"
                        maxLength={60}
                        required
                        placeholder="e.g. Executive Scissor Restyle"
                        value={formState.name}
                        onChange={(e) => setFormState((s) => ({ ...s, name: e.target.value }))}
                        className="w-full min-h-[48px] px-3.5 py-2.5 rounded-xl border border-stone-300 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-[#1E3A2F]"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label htmlFor="svc-duration" className="block text-sm font-medium text-stone-800">
                        Duration (Sydney slot length)
                      </label>
                      <select
                        id="svc-duration"
                        value={formState.durationMin}
                        onChange={(e) =>
                          setFormState((s) => ({ ...s, durationMin: Number(e.target.value) }))
                        }
                        className="w-full min-h-[48px] px-3.5 py-2.5 rounded-xl border border-stone-300 bg-white text-sm font-mono tabular-nums text-stone-900 focus:outline-none focus:ring-2 focus:ring-[#1E3A2F]"
                      >
                        {DURATION_OPTIONS.map((mins) => (
                          <option key={mins} value={mins}>
                            {mins} minutes
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label htmlFor="svc-price" className="block text-sm font-medium text-stone-800">
                        Price (AUD)
                      </label>
                      <input
                        id="svc-price"
                        type="number"
                        min={0}
                        max={999}
                        required
                        value={formState.priceAud}
                        onChange={(e) =>
                          setFormState((s) => ({
                            ...s,
                            priceAud: Math.max(0, Math.min(999, Number(e.target.value) || 0)),
                          }))
                        }
                        className="w-full min-h-[48px] px-3.5 py-2.5 rounded-xl border border-stone-300 text-sm font-mono tabular-nums text-stone-900 focus:outline-none focus:ring-2 focus:ring-[#1E3A2F]"
                      />
                    </div>

                    <div className="sm:col-span-2 space-y-1.5">
                      <label htmlFor="svc-desc" className="block text-sm font-medium text-stone-800">
                        Description
                      </label>
                      <textarea
                        id="svc-desc"
                        rows={3}
                        maxLength={240}
                        required
                        placeholder="Describe what is included in the appointment..."
                        value={formState.description}
                        onChange={(e) =>
                          setFormState((s) => ({ ...s, description: e.target.value }))
                        }
                        className="w-full px-3.5 py-2.5 rounded-xl border border-stone-300 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-[#1E3A2F]"
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-6 pt-1">
                    <label className="inline-flex items-center gap-2.5 min-h-[44px] cursor-pointer text-sm text-stone-800">
                      <input
                        type="checkbox"
                        checked={formState.popular}
                        onChange={(e) =>
                          setFormState((s) => ({ ...s, popular: e.target.checked }))
                        }
                        className="h-5 w-5 rounded border-stone-300 text-[#1E3A2F] focus:ring-[#1E3A2F]"
                      />
                      <span>Highlight as Most Booked</span>
                    </label>

                    <label className="inline-flex items-center gap-2.5 min-h-[44px] cursor-pointer text-sm text-stone-800">
                      <input
                        type="checkbox"
                        checked={formState.active}
                        onChange={(e) =>
                          setFormState((s) => ({ ...s, active: e.target.checked }))
                        }
                        className="h-5 w-5 rounded border-stone-300 text-[#1E3A2F] focus:ring-[#1E3A2F]"
                      />
                      <span>Visible on Booking Page</span>
                    </label>
                  </div>

                  <div className="flex flex-col-reverse sm:flex-row gap-3 pt-2">
                    <button
                      type="button"
                      disabled={savingService}
                      onClick={() => {
                        setEditorMode('none');
                        setEditingServiceId(null);
                      }}
                      className="min-h-[48px] px-5 py-3 rounded-xl border border-stone-300 text-sm font-medium text-stone-700 hover:bg-stone-50 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={savingService}
                      className="min-h-[48px] flex-1 sm:flex-initial px-6 py-3 rounded-xl bg-[#1E3A2F] text-white text-sm font-semibold hover:bg-[#162C23] transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
                    >
                      {savingService ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Saving...</span>
                        </>
                      ) : (
                        <span>
                          {editorMode === 'create' ? 'Create Service' : 'Save Changes'}
                        </span>
                      )}
                    </button>
                  </div>
                </form>
              ) : servicesLoading ? (
                <div className="py-10 flex items-center justify-center gap-2 text-sm text-stone-600">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Loading studio services...</span>
                </div>
              ) : (
                <div className="border border-stone-200 rounded-2xl divide-y divide-stone-100 overflow-hidden">
                  {adminServices.map((service) => (
                    <div
                      key={service.id}
                      className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                          <span className="font-semibold text-stone-900">{service.name}</span>
                          <span className="font-mono tabular-nums text-xs text-stone-600">
                            {service.durationMin} min · ${service.priceAud} AUD
                          </span>
                          {service.popular && (
                            <span className="text-xs font-medium text-[#8C6229]">
                              · Most booked
                            </span>
                          )}
                          {service.active === false && (
                            <span className="text-xs font-medium text-stone-500">
                              · Hidden
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-stone-600 leading-relaxed">
                          {service.description}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => openEditForm(service)}
                        className="min-h-[44px] px-4 py-2 rounded-xl border border-stone-300 text-xs sm:text-sm font-medium text-stone-800 hover:bg-stone-50 transition-colors inline-flex items-center justify-center gap-1.5 shrink-0"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        <span>Edit</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

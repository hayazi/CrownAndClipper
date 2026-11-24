import 'dotenv/config';
import express, { type NextFunction, type Request, type Response } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { STUDIO_INFO } from './shared/services.ts';
import { getNextSydneyDays, SYDNEY_TIMEZONE } from './shared/sydneyTime.ts';
import {
  authenticateAdminLogin,
  bootstrapAdminCredentials,
  getAdminAuthStatus,
  verifyAdminBearerToken,
} from './server/adminAuth.ts';
import {
  BookingConflictError,
  createBookingWithConflictGuard,
  getAvailableSlotsForDate,
  getServerCalendarCapabilities,
  GoogleCalendarAuthError,
  GoogleCalendarUpstreamError,
  resetMockBookings,
} from './server/calendarService.ts';
import {
  createStudioService,
  getActiveServiceById,
  getAllServices,
  getPublicServices,
  updateStudioService,
} from './server/studioStore.ts';
import {
  validateBookingPayload,
  validateServiceMutationPayload,
  validateSydneyDateStr,
} from './server/validation.ts';

process.env.TZ = SYDNEY_TIMEZONE;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const isProduction = process.env.NODE_ENV === 'production';

app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(express.json({ limit: '32kb' }));

// Security headers for Cloud Run & preview iframe safety
app.use((req: Request, res: Response, next: NextFunction) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  const allowedOriginsRaw = process.env.ALLOWED_ORIGIN?.trim();
  const origin = req.headers.origin;
  if (allowedOriginsRaw && origin) {
    const allowlist = allowedOriginsRaw
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    if (allowlist.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Booking-Mode');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
    }
  }

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  next();
});

function extractBearerToken(req: Request): string | undefined {
  const authHeader = req.headers.authorization;
  if (!authHeader || typeof authHeader !== 'string') return undefined;
  const match = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
  return match?.[1]?.trim();
}

function extractRequestedMode(req: Request): string | undefined {
  const queryMode = typeof req.query.mode === 'string' ? req.query.mode : undefined;
  const headerMode = typeof req.headers['x-booking-mode'] === 'string' ? req.headers['x-booking-mode'] : undefined;
  return (queryMode || headerMode || '').toLowerCase() || undefined;
}

app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    ok: true,
    timezone: SYDNEY_TIMEZONE,
    capabilities: getServerCalendarCapabilities(),
  });
});

app.get('/api/studio', (_req: Request, res: Response) => {
  res.json({
    studio: STUDIO_INFO,
    services: getPublicServices(),
    days: getNextSydneyDays(14),
    capabilities: getServerCalendarCapabilities(),
  });
});

app.get('/api/calendar/slots', async (req: Request, res: Response) => {
  const dateStr = validateSydneyDateStr(req.query.date);
  if (!dateStr) {
    res.status(400).json({ error: 'Invalid or out-of-range Sydney date (YYYY-MM-DD).' });
    return;
  }

  const serviceId = typeof req.query.serviceId === 'string' ? req.query.serviceId : '';
  const service = getActiveServiceById(serviceId);
  if (!service) {
    res.status(400).json({ error: 'Valid active serviceId is required.' });
    return;
  }

  try {
    const result = await getAvailableSlotsForDate({
      dateStr,
      durationMin: service.durationMin,
      requestedMode: extractRequestedMode(req),
      bearerToken: extractBearerToken(req),
    });
    res.json(result);
  } catch (err) {
    if (err instanceof GoogleCalendarAuthError) {
      res.status(err.statusCode).json({ error: err.message, code: 'AUTH_REQUIRED' });
      return;
    }
    if (err instanceof GoogleCalendarUpstreamError) {
      res.status(err.statusCode).json({ error: err.message, code: 'CALENDAR_UPSTREAM' });
      return;
    }
    console.error('Slots error:', err);
    res.status(500).json({ error: 'Unable to fetch calendar availability.' });
  }
});

app.post('/api/calendar/bookings', async (req: Request, res: Response) => {
  const validated = validateBookingPayload(req.body);
  if (!validated.ok) {
    res.status(400).json({ error: validated.error });
    return;
  }

  try {
    const booking = await createBookingWithConflictGuard({
      input: validated.data,
      requestedMode: extractRequestedMode(req),
      bearerToken: extractBearerToken(req),
    });
    res.status(201).json({ booking });
  } catch (err) {
    if (err instanceof BookingConflictError) {
      res.status(err.statusCode).json({ error: err.message, code: 'SLOT_CONFLICT' });
      return;
    }
    if (err instanceof GoogleCalendarAuthError) {
      res.status(err.statusCode).json({ error: err.message, code: 'AUTH_REQUIRED' });
      return;
    }
    if (err instanceof GoogleCalendarUpstreamError) {
      res.status(err.statusCode).json({ error: err.message, code: 'CALENDAR_UPSTREAM' });
      return;
    }
    console.error('Booking error:', err);
    res.status(500).json({ error: 'Unable to confirm appointment at this moment.' });
  }
});

app.post('/api/calendar/mock-reset', (_req: Request, res: Response) => {
  const caps = getServerCalendarCapabilities();
  if (isProduction && caps.defaultMode === 'live') {
    res.status(403).json({ error: 'Mock reset is disabled in live production mode.' });
    return;
  }
  resetMockBookings();
  res.json({ ok: true });
});

function requireAdminAuth(req: Request, res: Response, next: NextFunction): void {
  const token = extractBearerToken(req);
  const payload = verifyAdminBearerToken(token);
  if (!payload) {
    res.status(401).json({ error: 'Admin sign-in required or session expired.' });
    return;
  }
  next();
}

app.get('/api/admin/status', (_req: Request, res: Response) => {
  res.json(getAdminAuthStatus());
});

app.post('/api/admin/bootstrap', (req: Request, res: Response) => {
  const result = bootstrapAdminCredentials(req.body?.username, req.body?.password);
  if (!result.ok) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  res.status(201).json(result.session);
});

app.post('/api/admin/login', (req: Request, res: Response) => {
  const result = authenticateAdminLogin(req.body?.username, req.body?.password);
  if (!result.ok) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  res.json(result.session);
});

app.get('/api/admin/services', requireAdminAuth, (_req: Request, res: Response) => {
  res.json({ services: getAllServices() });
});

app.post('/api/admin/services', requireAdminAuth, (req: Request, res: Response) => {
  const validated = validateServiceMutationPayload(req.body);
  if (!validated.ok) {
    res.status(400).json({ error: validated.error });
    return;
  }
  const created = createStudioService(validated.data);
  res.status(201).json({
    service: created,
    services: getAllServices(),
    publicServices: getPublicServices(),
  });
});

app.put('/api/admin/services/:id', requireAdminAuth, (req: Request, res: Response) => {
  const id = typeof req.params.id === 'string' ? req.params.id.trim() : '';
  if (!/^[a-z0-9-]{1,60}$/.test(id)) {
    res.status(400).json({ error: 'Invalid service identifier.' });
    return;
  }

  const validated = validateServiceMutationPayload(req.body);
  if (!validated.ok) {
    res.status(400).json({ error: validated.error });
    return;
  }

  const updated = updateStudioService(id, validated.data);
  if (!updated) {
    res.status(404).json({ error: 'Service not found.' });
    return;
  }

  res.json({
    service: updated,
    services: getAllServices(),
    publicServices: getPublicServices(),
  });
});

async function startServer() {
  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    if (fs.existsSync(distDir)) {
      app.use(express.static(distDir));
      app.get('*', (_req: Request, res: Response) => {
        res.sendFile(path.join(distDir, 'index.html'));
      });
    }
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(
      `Crown & Clipper server running on http://0.0.0.0:${PORT} (TZ=${SYDNEY_TIMEZONE})`,
    );
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

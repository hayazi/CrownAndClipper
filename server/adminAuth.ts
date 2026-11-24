import crypto from 'crypto';
import {
  claimAdminCredential,
  getStoredAdminCredential,
} from './studioStore.ts';
import { sanitizePlainText } from './validation.ts';

// Ephemeral fallback signing key in memory if SESSION_SECRET is not provided in process.env
const FALLBACK_SIGNING_SECRET = crypto.randomBytes(32).toString('hex');
const TOKEN_TTL_MS = 8 * 60 * 60 * 1000;

export interface AdminAuthStatus {
  configured: boolean;
  source: 'env' | 'claimed' | 'unclaimed';
}

export interface AdminTokenPayload {
  sub: string;
  role: 'admin';
  exp: number;
}

function getSigningSecret(): string {
  return process.env.SESSION_SECRET?.trim() || FALLBACK_SIGNING_SECRET;
}

function getEnvAdminCredentials(): { username: string; password: string } | null {
  const password = process.env.ADMIN_PASSWORD?.trim();
  if (!password) return null;
  const username = process.env.ADMIN_USERNAME?.trim() || 'admin';
  return { username, password };
}

function safeEqualStrings(a: string, b: string): boolean {
  const digestA = crypto.createHash('sha256').update(a, 'utf8').digest();
  const digestB = crypto.createHash('sha256').update(b, 'utf8').digest();
  return crypto.timingSafeEqual(digestA, digestB);
}

function hashPasswordWithSalt(password: string, salt: string): string {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

export function getAdminAuthStatus(): AdminAuthStatus {
  if (getEnvAdminCredentials()) {
    return { configured: true, source: 'env' };
  }
  if (getStoredAdminCredential()) {
    return { configured: true, source: 'claimed' };
  }
  return { configured: false, source: 'unclaimed' };
}

export function signAdminToken(username: string): {
  token: string;
  expiresAt: number;
  username: string;
} {
  const expiresAt = Date.now() + TOKEN_TTL_MS;
  const payload: AdminTokenPayload = {
    sub: username,
    role: 'admin',
    exp: expiresAt,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = crypto
    .createHmac('sha256', getSigningSecret())
    .update(encodedPayload)
    .digest('base64url');

  return {
    token: `${encodedPayload}.${signature}`,
    expiresAt,
    username,
  };
}

export function verifyAdminBearerToken(token: string | undefined): AdminTokenPayload | null {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [encodedPayload, providedSig] = parts;
  const expectedSig = crypto
    .createHmac('sha256', getSigningSecret())
    .update(encodedPayload)
    .digest('base64url');

  if (!safeEqualStrings(providedSig, expectedSig)) {
    return null;
  }

  try {
    const decoded = JSON.parse(
      Buffer.from(encodedPayload, 'base64url').toString('utf8'),
    ) as Partial<AdminTokenPayload>;
    if (
      decoded.role !== 'admin' ||
      typeof decoded.sub !== 'string' ||
      typeof decoded.exp !== 'number' ||
      decoded.exp < Date.now()
    ) {
      return null;
    }
    return {
      sub: decoded.sub,
      role: 'admin',
      exp: decoded.exp,
    };
  } catch {
    return null;
  }
}

export function authenticateAdminLogin(
  rawUsername: unknown,
  rawPassword: unknown,
): { ok: true; session: { token: string; expiresAt: number; username: string } } | { ok: false; status: number; error: string } {
  if (typeof rawUsername !== 'string' || typeof rawPassword !== 'string') {
    return { ok: false, status: 400, error: 'Username and password are required.' };
  }

  const username = sanitizePlainText(rawUsername);
  const password = rawPassword;

  if (!username || !password) {
    return { ok: false, status: 400, error: 'Username and password are required.' };
  }

  const envCreds = getEnvAdminCredentials();
  if (envCreds) {
    const userMatch = safeEqualStrings(username, envCreds.username);
    const passMatch = safeEqualStrings(password, envCreds.password);
    if (!userMatch || !passMatch) {
      return { ok: false, status: 401, error: 'Invalid admin username or password.' };
    }
    return { ok: true, session: signAdminToken(envCreds.username) };
  }

  const stored = getStoredAdminCredential();
  if (!stored) {
    return {
      ok: false,
      status: 409,
      error: 'Admin credentials have not been set up yet. Complete first-run setup first.',
    };
  }

  const userMatch = safeEqualStrings(username, stored.username);
  const candidateHashHex = hashPasswordWithSalt(password, stored.salt);
  const passMatch = safeEqualStrings(candidateHashHex, stored.passwordHash);

  if (!userMatch || !passMatch) {
    return { ok: false, status: 401, error: 'Invalid admin username or password.' };
  }

  return { ok: true, session: signAdminToken(stored.username) };
}

export function bootstrapAdminCredentials(
  rawUsername: unknown,
  rawPassword: unknown,
): { ok: true; session: { token: string; expiresAt: number; username: string } } | { ok: false; status: number; error: string } {
  if (getEnvAdminCredentials() || getStoredAdminCredential()) {
    return {
      ok: false,
      status: 409,
      error: 'Admin credentials are already configured.',
    };
  }

  if (typeof rawUsername !== 'string' || typeof rawPassword !== 'string') {
    return { ok: false, status: 400, error: 'Username and password are required.' };
  }

  const username = sanitizePlainText(rawUsername);
  if (!/^[a-zA-Z0-9._-]{2,40}$/.test(username)) {
    return {
      ok: false,
      status: 400,
      error: 'Username must be 2–40 characters (letters, numbers, dot, underscore, hyphen).',
    };
  }

  if (rawPassword.length < 8 || rawPassword.length > 128) {
    return {
      ok: false,
      status: 400,
      error: 'Password must be between 8 and 128 characters.',
    };
  }

  const salt = crypto.randomBytes(16).toString('hex');
  const passwordHash = hashPasswordWithSalt(rawPassword, salt);

  const claimed = claimAdminCredential({
    username,
    salt,
    passwordHash,
    claimedAt: new Date().toISOString(),
  });

  if (!claimed) {
    return {
      ok: false,
      status: 409,
      error: 'Admin credentials have already been claimed.',
    };
  }

  return { ok: true, session: signAdminToken(username) };
}

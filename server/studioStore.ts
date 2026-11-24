import fs from 'fs';
import path from 'path';
import { BARBER_SERVICES, type BarberService } from '../shared/services.ts';

export interface StoredAdminCredential {
  username: string;
  salt: string;
  passwordHash: string;
  claimedAt: string;
}

interface StudioStoreData {
  services: BarberService[];
  adminCredential: StoredAdminCredential | null;
}

export interface ServiceMutationInput {
  name: string;
  durationMin: number;
  priceAud: number;
  description: string;
  popular: boolean;
  active: boolean;
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const STORE_PATH = path.join(DATA_DIR, 'studio-store.json');

let cachedStore: StudioStoreData | null = null;

function createDefaultStore(): StudioStoreData {
  return {
    services: BARBER_SERVICES.map((s) => ({ ...s, active: s.active !== false })),
    adminCredential: null,
  };
}

function loadStore(): StudioStoreData {
  if (cachedStore) return cachedStore;

  try {
    if (fs.existsSync(STORE_PATH)) {
      const raw = fs.readFileSync(STORE_PATH, 'utf8');
      const parsed = JSON.parse(raw) as Partial<StudioStoreData>;
      const services = Array.isArray(parsed.services) && parsed.services.length > 0
        ? parsed.services.map((s) => ({
            id: String(s.id),
            name: String(s.name),
            durationMin: Number(s.durationMin),
            priceAud: Number(s.priceAud),
            description: String(s.description),
            popular: Boolean(s.popular),
            active: s.active !== false,
          }))
        : createDefaultStore().services;

      cachedStore = {
        services,
        adminCredential: parsed.adminCredential ?? null,
      };
      return cachedStore;
    }
  } catch (err) {
    console.error('Failed to read studio store, using defaults:', err);
  }

  cachedStore = createDefaultStore();
  persistStore(cachedStore);
  return cachedStore;
}

function persistStore(store: StudioStoreData): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const tmpPath = `${STORE_PATH}.${process.pid}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(store, null, 2), 'utf8');
  fs.renameSync(tmpPath, STORE_PATH);
}

function slugifyServiceId(name: string, existingIds: Set<string>): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'service';

  if (!existingIds.has(base)) return base;
  let counter = 2;
  while (existingIds.has(`${base}-${counter}`)) {
    counter += 1;
  }
  return `${base}-${counter}`;
}

export function getAllServices(): BarberService[] {
  return loadStore().services.map((s) => ({ ...s }));
}

export function getPublicServices(): BarberService[] {
  return loadStore()
    .services.filter((s) => s.active !== false)
    .map((s) => ({ ...s }));
}

export function getActiveServiceById(id: string): BarberService | undefined {
  return loadStore().services.find((s) => s.id === id && s.active !== false);
}

export function createStudioService(input: ServiceMutationInput): BarberService {
  const store = loadStore();
  const existingIds = new Set(store.services.map((s) => s.id));
  const newService: BarberService = {
    id: slugifyServiceId(input.name, existingIds),
    name: input.name,
    durationMin: input.durationMin,
    priceAud: input.priceAud,
    description: input.description,
    popular: input.popular,
    active: input.active,
  };

  store.services = [...store.services, newService];
  persistStore(store);
  return { ...newService };
}

export function updateStudioService(
  id: string,
  input: ServiceMutationInput,
): BarberService | null {
  const store = loadStore();
  const index = store.services.findIndex((s) => s.id === id);
  if (index === -1) return null;

  const updated: BarberService = {
    id,
    name: input.name,
    durationMin: input.durationMin,
    priceAud: input.priceAud,
    description: input.description,
    popular: input.popular,
    active: input.active,
  };

  store.services[index] = updated;
  persistStore(store);
  return { ...updated };
}

export function getStoredAdminCredential(): StoredAdminCredential | null {
  return loadStore().adminCredential;
}

export function claimAdminCredential(cred: StoredAdminCredential): boolean {
  const store = loadStore();
  if (store.adminCredential !== null) {
    return false;
  }
  store.adminCredential = cred;
  persistStore(store);
  return true;
}

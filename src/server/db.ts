import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_SUGGESTED_QUERIES,
  ESTABLISHMENT_CATEGORIES,
  PET_TYPES,
  SERVICE_CATEGORIES,
  type CatalogMetadata,
  type ChatTurn,
  type Establishment,
  type EstablishmentCategory,
  type EstablishmentCategoryItem,
  type EstablishmentInput,
  type PetService,
  type PetTypeItem,
  type ReferencedEstablishmentSummary,
  type ServiceCategoryItem,
  type SuggestedQueryItem,
} from '../types/petcare.ts';
import { SEED_ESTABLISHMENTS } from './seedData.ts';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const LOCAL_STORE_PATH = path.join(DATA_DIR, 'petcare-store.json');
const LOCAL_CHAT_PATH = path.join(DATA_DIR, 'petcare-chat.json');

let supabaseClient: SupabaseClient | null = null;
let activeSupabaseConfig: { url: string; key: string; envName: string } | null = null;
let supabaseSeeded = false;

let supabaseConfigWarning: string | null = null;

function cleanEnvValue(raw: string | undefined): string {
  if (!raw) return '';
  return raw.trim().replace(/^["']|["']$/g, '').trim();
}

function getAllSupabaseKeyCandidates(): Array<{ key: string; envName: string }> {
  const candidates: Array<[string, string | undefined]> = [
    ['SUPABASE_SERVICE_ROLE_KEY', process.env.SUPABASE_SERVICE_ROLE_KEY],
    ['SUPABASE_SECRET_KEY', process.env.SUPABASE_SECRET_KEY],
    ['SUPABASE_ANON_KEY', process.env.SUPABASE_ANON_KEY],
    ['VITE_SUPABASE_ANON_KEY', process.env.VITE_SUPABASE_ANON_KEY],
    ['VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY', process.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY],
    ['VITE_SUPABASE_PUBLISHABLE_KEY', process.env.VITE_SUPABASE_PUBLISHABLE_KEY],
    ['SUPABASE_PUBLISHABLE_KEY', process.env.SUPABASE_PUBLISHABLE_KEY],
    ['SUPABASE_KEY', process.env.SUPABASE_KEY],
  ];

  const cleaned = candidates
    .map(([envName, raw]) => ({ envName, key: cleanEnvValue(raw) }))
    .filter(
      (item) =>
        item.key.length > 0 &&
        !/^(MY_|TU_|YOUR_|PLACEHOLDER|EXAMPLE)/i.test(item.key)
    );

  // Ordenar primero claves con formato válido de proyecto (eyJ..., sb_secret_..., sb_publishable_...)
  const preferred = cleaned.filter(
    (item) =>
      item.key.startsWith('eyJ') ||
      item.key.startsWith('sb_secret_') ||
      item.key.startsWith('sb_publishable_')
  );
  const rest = cleaned.filter((item) => !preferred.includes(item));
  return [...preferred, ...rest];
}

function diagnoseKeyAgainstUrl(url: string, key: string, envName: string): string | null {
  if (key.startsWith('sbp_')) {
    return `${envName} contiene un token personal de cuenta (sbp_...), no una clave del proyecto. Copiá 'service_role' o 'anon' desde Supabase → Project Settings → API Keys.`;
  }

  if (key.startsWith('postgresql://') || key.startsWith('postgres://')) {
    return `${envName} contiene una cadena de conexión PostgreSQL, no una clave API. Copiá 'service_role' o 'anon' desde Project Settings → API Keys.`;
  }

  if (
    !key.startsWith('eyJ') &&
    !key.startsWith('sb_secret_') &&
    !key.startsWith('sb_publishable_')
  ) {
    return `${envName} no tiene formato de clave API de Supabase (debe comenzar con 'eyJ...', 'sb_secret_...' o 'sb_publishable_...'). Verificá no haber copiado la contraseña de la base de datos ni el JWT Secret; copiala en Project Settings → API Keys.`;
  }

  if (key.startsWith('eyJ') && key.split('.').length === 3) {
    try {
      const payloadJson = Buffer.from(key.split('.')[1], 'base64url').toString('utf8');
      const payload = JSON.parse(payloadJson) as { ref?: string; role?: string };
      const hostMatch = new URL(url).hostname.match(/^([a-z0-9-]+)\.supabase\.co$/i);
      if (payload.ref && hostMatch && payload.ref !== hostMatch[1]) {
        return `El proyecto de SUPABASE_URL (${hostMatch[1]}) no coincide con el proyecto de ${envName} (${payload.ref}). Verificá que ambos pertenezcan al mismo proyecto en Supabase.`;
      }
    } catch {
      // Si no se puede decodificar, continuar y dejar que Supabase valide
    }
  }

  return null;
}

function getNormalizedSupabaseUrl(): string | null {
  supabaseConfigWarning = null;
  let url =
    cleanEnvValue(process.env.SUPABASE_URL) ||
    cleanEnvValue(process.env.VITE_SUPABASE_URL) ||
    cleanEnvValue(process.env.NEXT_PUBLIC_SUPABASE_URL);

  if (!url) return null;

  if (/^(MY_|TU_|YOUR_|PLACEHOLDER)/i.test(url)) {
    supabaseConfigWarning =
      'SUPABASE_URL aún tiene un valor de ejemplo; usando almacenamiento local temporal.';
    return null;
  }

  const dashboardMatch = url.match(
    /^https?:\/\/supabase\.com\/dashboard\/project\/([a-z0-9]+)/i
  );
  if (dashboardMatch) {
    url = `https://${dashboardMatch[1]}.supabase.co`;
  } else if (/^[a-z0-9-]+\.supabase\.co(\/.*)?$/i.test(url)) {
    url = `https://${url}`;
  } else if (/^[a-z0-9]{16,30}$/i.test(url)) {
    url = `https://${url}.supabase.co`;
  }

  url = url.replace(/\/+$/, '');

  try {
    const parsed = new URL(url);
    if (
      (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') ||
      !parsed.hostname.includes('.')
    ) {
      supabaseConfigWarning =
        'SUPABASE_URL no es una URL válida (ej. https://tu-proyecto.supabase.co); usando almacenamiento local temporal.';
      return null;
    }
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    supabaseConfigWarning =
      'SUPABASE_URL no tiene formato de URL válido (ej. https://tu-proyecto.supabase.co); usando almacenamiento local temporal.';
    return null;
  }
}

function getSupabaseConfig(): { url: string; key: string; envName: string } | null {
  if (activeSupabaseConfig) return activeSupabaseConfig;
  const url = getNormalizedSupabaseUrl();
  if (!url) return null;
  const candidates = getAllSupabaseKeyCandidates();
  if (candidates.length === 0) return null;
  return { url, key: candidates[0].key, envName: candidates[0].envName };
}

function isAuthError(error: { message?: string; code?: string; details?: string } | null | undefined): boolean {
  if (!error) return false;
  const combined = `${error.code ?? ''} ${error.message ?? ''} ${error.details ?? ''}`.toLowerCase();
  return (
    combined.includes('invalid api key') ||
    combined.includes('jwt') ||
    combined.includes('401') ||
    combined.includes('unauthorized')
  );
}

function formatSupabaseError(
  context: string,
  error: { message?: string; code?: string; details?: string; hint?: string } | null | undefined
): string {
  const msg = error?.message?.trim() || '';
  const code = error?.code?.trim() || '';
  const details = error?.details?.trim() || '';
  const hint = error?.hint?.trim() || '';
  const combined = `${code} ${msg} ${details}`.toLowerCase();

  const config = getSupabaseConfig();
  if (config) {
    const mismatch = diagnoseKeyAgainstUrl(config.url, config.key, config.envName);
    if (mismatch) {
      return `${context}: ${mismatch}`;
    }
  }

  if (
    code === 'PGRST205' ||
    code === '42P01' ||
    combined.includes('could not find the table') ||
    combined.includes('does not exist')
  ) {
    return `${context}: faltan las tablas 'establishments' y 'services' en Supabase. Ejecutá el SQL en Supabase → SQL Editor.`;
  }

  if (isAuthError(error)) {
    const envName = config?.envName ?? 'SUPABASE_SERVICE_ROLE_KEY';
    const rawDetail = [code, msg].filter(Boolean).join(' - ');
    return `${context}: la clave ${envName} fue rechazada por Supabase (${rawDetail || 'Invalid API key'}). Copiá la clave 'service_role' o 'anon' desde Supabase → Project Settings → API Keys.`;
  }

  if (
    combined.includes('fetch failed') ||
    combined.includes('enotfound') ||
    combined.includes('econnrefused')
  ) {
    return `${context}: no se pudo conectar con SUPABASE_URL. Verificá que la URL sea https://tu-proyecto.supabase.co y que el proyecto no esté pausado.`;
  }

  const rawParts = [code, msg, details, hint].filter(Boolean).join(' · ');
  return rawParts
    ? `${context}: ${rawParts}`
    : `${context}: verificá SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY y que hayas ejecutado el script SQL.`;
}

async function resolveWorkingSupabase(): Promise<SupabaseClient | null> {
  if (supabaseClient) return supabaseClient;

  const url = getNormalizedSupabaseUrl();
  if (!url) return null;

  const candidates = getAllSupabaseKeyCandidates();
  if (candidates.length === 0) return null;

  let lastAuthError: { message?: string; code?: string; details?: string } | null = null;
  let lastBadConfig: { url: string; key: string; envName: string } | null = null;

  for (const candidate of candidates) {
    const preCheckError = diagnoseKeyAgainstUrl(url, candidate.key, candidate.envName);
    if (preCheckError && candidates.length > 1) {
      lastBadConfig = { url, key: candidate.key, envName: candidate.envName };
      continue;
    }

    try {
      const client = createClient(url, candidate.key, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      });

      const { error } = await client.from('establishments').select('id').limit(1);
      if (error && isAuthError(error)) {
        lastAuthError = error;
        lastBadConfig = { url, key: candidate.key, envName: candidate.envName };
        continue;
      }

      activeSupabaseConfig = { url, key: candidate.key, envName: candidate.envName };
      supabaseClient = client;
      return client;
    } catch (err) {
      supabaseConfigWarning =
        err instanceof Error ? err.message : 'No se pudo inicializar el cliente de Supabase.';
    }
  }

  if (lastBadConfig) {
    activeSupabaseConfig = lastBadConfig;
    throw new Error(
      formatSupabaseError(
        'Error al consultar Supabase',
        lastAuthError ?? { message: 'Invalid API key' }
      )
    );
  }

  return null;
}

export function isSupabaseConfigured(): boolean {
  return getSupabaseConfig() !== null;
}

function isMissingTableError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  const code = error.code?.trim() || '';
  const msg = (error.message || '').toLowerCase();
  return (
    code === 'PGRST205' ||
    code === '42P01' ||
    msg.includes('could not find the table') ||
    msg.includes('does not exist')
  );
}

export async function checkSupabaseHealth(): Promise<{
  configured: boolean;
  ok: boolean;
  detail?: string;
  missingTables?: string[];
}> {
  const config = getSupabaseConfig();
  if (!config) {
    return {
      configured: false,
      ok: false,
      detail: supabaseConfigWarning ?? 'Variables no configuradas',
    };
  }
  try {
    const client = await resolveWorkingSupabase();
    if (!client) {
      return {
        configured: false,
        ok: false,
        detail: supabaseConfigWarning ?? 'Cliente de Supabase no inicializado',
      };
    }

    const tables = [
      'establishment_categories',
      'pet_types',
      'service_categories',
      'establishments',
      'services',
      'suggested_queries',
      'chat_messages',
    ];
    const checks = await Promise.all(
      tables.map(async (table) => {
        const { error } = await client.from(table).select('id').limit(1);
        return { table, error };
      })
    );

    const missingTables = checks
      .filter((c) => isMissingTableError(c.error))
      .map((c) => c.table);

    const fatal = checks.find((c) => c.error && !isMissingTableError(c.error));
    if (fatal) {
      return {
        configured: true,
        ok: false,
        detail: formatSupabaseError('Error al consultar Supabase', fatal.error),
        missingTables,
      };
    }

    if (missingTables.includes('establishments') || missingTables.includes('services')) {
      return {
        configured: true,
        ok: false,
        detail: `Faltan las tablas ${missingTables.join(', ')} en Supabase. Ejecutá el script SQL en Supabase → SQL Editor.`,
        missingTables,
      };
    }

    return {
      configured: true,
      ok: true,
      missingTables,
    };
  } catch (err) {
    return {
      configured: true,
      ok: false,
      detail:
        err instanceof Error
          ? formatSupabaseError('Error al conectar con Supabase', {
              message: err.message,
            })
          : 'Error de red al conectar con Supabase',
    };
  }
}

function buildSeedRecords(): Establishment[] {
  const now = new Date().toISOString();
  return SEED_ESTABLISHMENTS.map((item) => {
    const estId = crypto.randomUUID();
    const services: PetService[] = item.services.map((svc) => ({
      id: crypto.randomUUID(),
      establishment_id: estId,
      name: svc.name,
      category: svc.category,
      pet_type: svc.pet_type,
      price_pyg: svc.price_pyg,
      duration_minutes: svc.duration_minutes,
      description: svc.description,
      created_at: now,
    }));

    return {
      id: estId,
      name: item.name,
      category: item.category,
      address: item.address,
      phone: item.phone,
      hours: item.hours,
      latitude: item.latitude,
      longitude: item.longitude,
      pet_types: [...item.pet_types],
      description: item.description,
      created_at: now,
      updated_at: now,
      services,
    };
  });
}

function readLocalStore(): Establishment[] {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(LOCAL_STORE_PATH)) {
    const seeded = buildSeedRecords();
    fs.writeFileSync(LOCAL_STORE_PATH, JSON.stringify(seeded, null, 2), 'utf-8');
    return seeded;
  }
  try {
    const raw = fs.readFileSync(LOCAL_STORE_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as Establishment[];
    if (!Array.isArray(parsed) || parsed.length === 0) {
      const seeded = buildSeedRecords();
      fs.writeFileSync(LOCAL_STORE_PATH, JSON.stringify(seeded, null, 2), 'utf-8');
      return seeded;
    }
    return parsed;
  } catch {
    const seeded = buildSeedRecords();
    fs.writeFileSync(LOCAL_STORE_PATH, JSON.stringify(seeded, null, 2), 'utf-8');
    return seeded;
  }
}

function writeLocalStore(records: Establishment[]): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(LOCAL_STORE_PATH, JSON.stringify(records, null, 2), 'utf-8');
}

async function ensureSupabaseSeeded(client: SupabaseClient): Promise<void> {
  if (supabaseSeeded) return;

  // Usar GET con limit(1) en lugar de head:true para recibir el detalle completo ante cualquier error HTTP
  const { data: existingRows, error } = await client
    .from('establishments')
    .select('id')
    .limit(1);

  if (error) {
    throw new Error(formatSupabaseError('Error al consultar Supabase', error));
  }

  if (!existingRows || existingRows.length === 0) {
    for (const item of SEED_ESTABLISHMENTS) {
      const { data: createdEst, error: estErr } = await client
        .from('establishments')
        .insert({
          name: item.name,
          category: item.category,
          address: item.address,
          phone: item.phone,
          hours: item.hours,
          latitude: item.latitude,
          longitude: item.longitude,
          pet_types: item.pet_types,
          description: item.description,
        })
        .select('id')
        .single();

      if (estErr || !createdEst) {
        throw new Error(
          formatSupabaseError('Error al insertar semilla en Supabase', estErr)
        );
      }

      if (item.services.length > 0) {
        const { error: svcErr } = await client.from('services').insert(
          item.services.map((svc) => ({
            establishment_id: createdEst.id,
            name: svc.name,
            category: svc.category,
            pet_type: svc.pet_type,
            price_pyg: svc.price_pyg,
            duration_minutes: svc.duration_minutes,
            description: svc.description,
          }))
        );
        if (svcErr) {
          throw new Error(
            formatSupabaseError('Error al insertar servicios semilla', svcErr)
          );
        }
      }
    }
  }

  supabaseSeeded = true;
}

function normalizeCategory(raw: unknown): EstablishmentCategory {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) return 'Veterinaria';
  const val = trimmed.toLowerCase();
  if (val.includes('peluq') || val.includes('groom') || val.includes('spa')) {
    return 'Peluquería Canina';
  }
  if (val.includes('tienda') || val.includes('shop') || val.includes('pet')) {
    return 'Tienda de Mascotas';
  }
  if (val.includes('veterin')) {
    return 'Veterinaria';
  }
  return trimmed;
}

function parsePetTypes(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed || trimmed === '{}') return [];
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return parsed.map((item) => String(item).trim()).filter(Boolean);
        }
      } catch {
        // continuar con el parseo de arreglo PostgreSQL o texto separado por comas
      }
    }
    const stripped =
      trimmed.startsWith('{') && trimmed.endsWith('}')
        ? trimmed.slice(1, -1)
        : trimmed;
    return stripped
      .split(',')
      .map((item) => item.trim().replace(/^["']|["']$/g, ''))
      .filter(Boolean);
  }
  return [];
}

function parseFiniteNumber(raw: unknown, fallback = 0): number {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? raw : fallback;
  }
  if (typeof raw === 'string') {
    const normalized = raw.trim().replace(',', '.');
    if (!normalized) return fallback;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function normalizeEstablishmentRow(row: Record<string, unknown>): Establishment {
  const rawServices = Array.isArray(row.services) ? row.services : [];
  const services: PetService[] = rawServices.map((s: Record<string, unknown>) => {
    const rawDuration =
      s.duration_minutes === null ||
      s.duration_minutes === undefined ||
      s.duration_minutes === ''
        ? null
        : parseFiniteNumber(s.duration_minutes, NaN);

    return {
      id: String(s.id ?? ''),
      establishment_id: String(s.establishment_id ?? row.id ?? ''),
      name: String(s.name ?? ''),
      category: String(s.category ?? 'General'),
      pet_type: String(s.pet_type ?? 'Perros y Gatos'),
      price_pyg: Math.max(0, Math.round(parseFiniteNumber(s.price_pyg, 0))),
      duration_minutes:
        rawDuration !== null && Number.isFinite(rawDuration)
          ? Math.round(rawDuration)
          : null,
      description: String(s.description ?? ''),
      created_at: s.created_at ? String(s.created_at) : undefined,
    };
  });

  return {
    id: String(row.id ?? ''),
    name: String(row.name ?? ''),
    category: normalizeCategory(row.category),
    address: String(row.address ?? ''),
    phone: String(row.phone ?? ''),
    hours: String(row.hours ?? ''),
    latitude: parseFiniteNumber(row.latitude, 0),
    longitude: parseFiniteNumber(row.longitude, 0),
    pet_types: parsePetTypes(row.pet_types),
    description: String(row.description ?? ''),
    created_at: row.created_at ? String(row.created_at) : undefined,
    updated_at: row.updated_at ? String(row.updated_at) : undefined,
    services,
  };
}

export interface EstablishmentFilters {
  q?: string;
  category?: string;
  petType?: string;
  serviceCategory?: string;
}

export function filterEstablishmentsList(
  items: Establishment[],
  filters?: EstablishmentFilters
): Establishment[] {
  if (!filters) return items;

  const q = filters.q?.trim().toLowerCase() || '';
  const category = filters.category?.trim() || '';
  const petType = filters.petType?.trim().toLowerCase() || '';
  const serviceCategory = filters.serviceCategory?.trim().toLowerCase() || '';

  return items.filter((est) => {
    if (category && category !== 'Todos' && est.category !== category) {
      return false;
    }

    if (petType && petType !== 'todas') {
      const matchesEstPet = est.pet_types.some((pt) =>
        pt.toLowerCase().includes(petType)
      );
      const matchesServicePet = est.services.some((svc) => {
        const svcPet = svc.pet_type.toLowerCase();
        return (
          svcPet.includes(petType) ||
          svcPet.includes('todas') ||
          (petType === 'perros' && svcPet.includes('perro')) ||
          (petType === 'gatos' && svcPet.includes('gato'))
        );
      });
      if (!matchesEstPet && !matchesServicePet) {
        return false;
      }
    }

    if (serviceCategory && serviceCategory !== 'todos') {
      const matchesServiceCat = est.services.some(
        (svc) =>
          svc.category.toLowerCase().includes(serviceCategory) ||
          svc.name.toLowerCase().includes(serviceCategory)
      );
      if (!matchesServiceCat) {
        return false;
      }
    }

    if (q) {
      const inEst =
        est.name.toLowerCase().includes(q) ||
        est.address.toLowerCase().includes(q) ||
        est.category.toLowerCase().includes(q) ||
        est.description.toLowerCase().includes(q) ||
        est.hours.toLowerCase().includes(q);
      const inServices = est.services.some(
        (svc) =>
          svc.name.toLowerCase().includes(q) ||
          svc.category.toLowerCase().includes(q) ||
          svc.description.toLowerCase().includes(q)
      );
      if (!inEst && !inServices) {
        return false;
      }
    }

    return true;
  });
}

export async function listEstablishments(
  filters?: EstablishmentFilters
): Promise<Establishment[]> {
  const client = await resolveWorkingSupabase();

  if (client) {
    await ensureSupabaseSeeded(client);
    const { data, error } = await client
      .from('establishments')
      .select('*, services(*)')
      .order('created_at', { ascending: true });

    if (!error && data) {
      const list = data.map((row) =>
        normalizeEstablishmentRow(row as Record<string, unknown>)
      );
      return filterEstablishmentsList(list, filters);
    }

    // Fallback si PostgREST aún no refrescó la relación foreign key en caché (PGRST200/PGRST201)
    const errText = `${error?.code ?? ''} ${error?.message ?? ''}`.toLowerCase();
    if (
      error &&
      (error.code === 'PGRST200' ||
        error.code === 'PGRST201' ||
        errText.includes('relationship') ||
        errText.includes('schema cache'))
    ) {
      const [estRes, svcRes] = await Promise.all([
        client.from('establishments').select('*').order('created_at', { ascending: true }),
        client.from('services').select('*').order('created_at', { ascending: true }),
      ]);

      if (estRes.error) {
        throw new Error(formatSupabaseError('Error al listar establecimientos en Supabase', estRes.error));
      }
      if (svcRes.error) {
        throw new Error(formatSupabaseError('Error al listar servicios en Supabase', svcRes.error));
      }

      const servicesByEst: Record<string, Record<string, unknown>[]> = {};
      for (const svc of svcRes.data ?? []) {
        const estId = String((svc as Record<string, unknown>).establishment_id ?? '');
        if (!servicesByEst[estId]) servicesByEst[estId] = [];
        servicesByEst[estId].push(svc as Record<string, unknown>);
      }

      const list = (estRes.data ?? []).map((row) => {
        const r = row as Record<string, unknown>;
        return normalizeEstablishmentRow({
          ...r,
          services: servicesByEst[String(r.id ?? '')] ?? [],
        });
      });
      return filterEstablishmentsList(list, filters);
    }

    throw new Error(formatSupabaseError('Error al listar establecimientos en Supabase', error));
  }

  const localList = readLocalStore();
  return filterEstablishmentsList(localList, filters);
}

export async function getEstablishmentById(
  id: string
): Promise<Establishment | null> {
  const client = await resolveWorkingSupabase();

  if (client) {
    await ensureSupabaseSeeded(client);
    const { data, error } = await client
      .from('establishments')
      .select('*, services(*)')
      .eq('id', id)
      .maybeSingle();

    if (!error) {
      return data ? normalizeEstablishmentRow(data as Record<string, unknown>) : null;
    }

    const singleErrText = `${error.code ?? ''} ${error.message ?? ''}`.toLowerCase();
    if (
      error.code === 'PGRST200' ||
      error.code === 'PGRST201' ||
      singleErrText.includes('relationship') ||
      singleErrText.includes('schema cache')
    ) {
      const [estRes, svcRes] = await Promise.all([
        client.from('establishments').select('*').eq('id', id).maybeSingle(),
        client.from('services').select('*').eq('establishment_id', id),
      ]);
      if (estRes.error) {
        throw new Error(formatSupabaseError('Error al obtener establecimiento', estRes.error));
      }
      if (svcRes.error) {
        throw new Error(formatSupabaseError('Error al obtener servicios del establecimiento', svcRes.error));
      }
      if (!estRes.data) return null;
      return normalizeEstablishmentRow({
        ...(estRes.data as Record<string, unknown>),
        services: svcRes.data ?? [],
      });
    }

    throw new Error(formatSupabaseError('Error al obtener establecimiento', error));
  }

  const localList = readLocalStore();
  return localList.find((item) => item.id === id) ?? null;
}

export async function createEstablishment(
  input: EstablishmentInput
): Promise<Establishment> {
  const client = await resolveWorkingSupabase();

  if (client) {
    await ensureSupabaseSeeded(client);
    const { data: createdEst, error: estErr } = await client
      .from('establishments')
      .insert({
        name: input.name,
        category: input.category,
        address: input.address,
        phone: input.phone,
        hours: input.hours,
        latitude: input.latitude,
        longitude: input.longitude,
        pet_types: input.pet_types,
        description: input.description,
      })
      .select('*')
      .single();

    if (estErr || !createdEst) {
      throw new Error(
        formatSupabaseError('Error al crear establecimiento en Supabase', estErr)
      );
    }

    if (input.services.length > 0) {
      const { error: svcErr } = await client.from('services').insert(
        input.services.map((svc) => ({
          establishment_id: createdEst.id,
          name: svc.name,
          category: svc.category,
          pet_type: svc.pet_type,
          price_pyg: svc.price_pyg,
          duration_minutes: svc.duration_minutes,
          description: svc.description,
        }))
      );
      if (svcErr) {
        await client.from('establishments').delete().eq('id', createdEst.id);
        throw new Error(
          formatSupabaseError('Error al registrar servicios en Supabase', svcErr)
        );
      }
    }

    const full = await getEstablishmentById(String(createdEst.id));
    if (!full) {
      throw new Error('No se pudo recuperar el establecimiento creado.');
    }
    return full;
  }

  const localList = readLocalStore();
  const now = new Date().toISOString();
  const estId = crypto.randomUUID();
  const newRecord: Establishment = {
    id: estId,
    name: input.name,
    category: input.category,
    address: input.address,
    phone: input.phone,
    hours: input.hours,
    latitude: input.latitude,
    longitude: input.longitude,
    pet_types: [...input.pet_types],
    description: input.description,
    created_at: now,
    updated_at: now,
    services: input.services.map((svc) => ({
      id: crypto.randomUUID(),
      establishment_id: estId,
      name: svc.name,
      category: svc.category,
      pet_type: svc.pet_type,
      price_pyg: svc.price_pyg,
      duration_minutes: svc.duration_minutes,
      description: svc.description,
      created_at: now,
    })),
  };

  localList.push(newRecord);
  writeLocalStore(localList);
  return newRecord;
}

export async function updateEstablishment(
  id: string,
  input: EstablishmentInput
): Promise<Establishment | null> {
  const client = await resolveWorkingSupabase();

  if (client) {
    await ensureSupabaseSeeded(client);
    const { data: updatedEst, error: estErr } = await client
      .from('establishments')
      .update({
        name: input.name,
        category: input.category,
        address: input.address,
        phone: input.phone,
        hours: input.hours,
        latitude: input.latitude,
        longitude: input.longitude,
        pet_types: input.pet_types,
        description: input.description,
      })
      .eq('id', id)
      .select('id')
      .maybeSingle();

    if (estErr) {
      throw new Error(
        formatSupabaseError('Error al actualizar establecimiento en Supabase', estErr)
      );
    }
    if (!updatedEst) {
      return null;
    }

    const { error: delSvcErr } = await client
      .from('services')
      .delete()
      .eq('establishment_id', id);

    if (delSvcErr) {
      throw new Error(
        formatSupabaseError('Error al actualizar servicios en Supabase', delSvcErr)
      );
    }

    if (input.services.length > 0) {
      const { error: insSvcErr } = await client.from('services').insert(
        input.services.map((svc) => ({
          establishment_id: id,
          name: svc.name,
          category: svc.category,
          pet_type: svc.pet_type,
          price_pyg: svc.price_pyg,
          duration_minutes: svc.duration_minutes,
          description: svc.description,
        }))
      );
      if (insSvcErr) {
        throw new Error(
          formatSupabaseError('Error al guardar servicios actualizados en Supabase', insSvcErr)
        );
      }
    }

    return await getEstablishmentById(id);
  }

  const localList = readLocalStore();
  const idx = localList.findIndex((item) => item.id === id);
  if (idx === -1) return null;

  const now = new Date().toISOString();
  const updated: Establishment = {
    ...localList[idx],
    name: input.name,
    category: input.category,
    address: input.address,
    phone: input.phone,
    hours: input.hours,
    latitude: input.latitude,
    longitude: input.longitude,
    pet_types: [...input.pet_types],
    description: input.description,
    updated_at: now,
    services: input.services.map((svc) => ({
      id: svc.id || crypto.randomUUID(),
      establishment_id: id,
      name: svc.name,
      category: svc.category,
      pet_type: svc.pet_type,
      price_pyg: svc.price_pyg,
      duration_minutes: svc.duration_minutes,
      description: svc.description,
      created_at: now,
    })),
  };

  localList[idx] = updated;
  writeLocalStore(localList);
  return updated;
}

export async function deleteEstablishment(id: string): Promise<boolean> {
  const client = await resolveWorkingSupabase();

  if (client) {
    await ensureSupabaseSeeded(client);
    const { data, error } = await client
      .from('establishments')
      .delete()
      .eq('id', id)
      .select('id');

    if (error) {
      throw new Error(
        formatSupabaseError('Error al eliminar establecimiento en Supabase', error)
      );
    }
    return Array.isArray(data) && data.length > 0;
  }

  const localList = readLocalStore();
  const next = localList.filter((item) => item.id !== id);
  if (next.length === localList.length) {
    return false;
  }
  writeLocalStore(next);
  return true;
}

const DEFAULT_ESTABLISHMENT_CATEGORIES: EstablishmentCategoryItem[] =
  ESTABLISHMENT_CATEGORIES.map((name, idx) => ({
    id: `default-cat-${idx + 1}`,
    name: String(name),
    description: '',
    color_hex:
      name === 'Veterinaria'
        ? '#0F766E'
        : name === 'Peluquería Canina'
        ? '#B45309'
        : '#4338CA',
    sort_order: idx + 1,
  }));

const DEFAULT_PET_TYPES: PetTypeItem[] = PET_TYPES.map((name, idx) => ({
  id: `default-pet-${idx + 1}`,
  name,
  description: '',
  sort_order: idx + 1,
}));

const DEFAULT_SERVICE_CATEGORIES: ServiceCategoryItem[] =
  SERVICE_CATEGORIES.map((name, idx) => ({
    id: `default-svc-cat-${idx + 1}`,
    name,
    description: '',
    sort_order: idx + 1,
  }));

const DEFAULT_SUGGESTED_QUERY_ITEMS: SuggestedQueryItem[] =
  DEFAULT_SUGGESTED_QUERIES.map((question, idx) => ({
    id: `default-query-${idx + 1}`,
    question,
    category: 'General',
    sort_order: idx + 1,
  }));

export async function getCatalogMetadata(): Promise<CatalogMetadata> {
  const client = await resolveWorkingSupabase();
  if (!client) {
    return {
      establishmentCategories: DEFAULT_ESTABLISHMENT_CATEGORIES,
      petTypes: DEFAULT_PET_TYPES,
      serviceCategories: DEFAULT_SERVICE_CATEGORIES,
      suggestedQueries: DEFAULT_SUGGESTED_QUERY_ITEMS,
      missingTables: [],
    };
  }

  const missingTables: string[] = [];

  const [estCatRes, petRes, svcCatRes, queryRes] = await Promise.all([
    client.from('establishment_categories').select('*').order('sort_order', { ascending: true }),
    client.from('pet_types').select('*').order('sort_order', { ascending: true }),
    client.from('service_categories').select('*').order('sort_order', { ascending: true }),
    client
      .from('suggested_queries')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true }),
  ]);

  let establishmentCategories = DEFAULT_ESTABLISHMENT_CATEGORIES;
  if (estCatRes.error) {
    if (isMissingTableError(estCatRes.error)) {
      missingTables.push('establishment_categories');
    }
  } else if (estCatRes.data && estCatRes.data.length > 0) {
    establishmentCategories = estCatRes.data.map((r: Record<string, unknown>, i: number) => ({
      id: String(r.id ?? `cat-${i}`),
      name: String(r.name ?? ''),
      description: String(r.description ?? ''),
      color_hex: String(r.color_hex ?? '#0F766E'),
      sort_order: Number(r.sort_order ?? i + 1),
    }));
  } else {
    const seedRows = DEFAULT_ESTABLISHMENT_CATEGORIES.map((c) => ({
      name: c.name,
      description: c.description,
      color_hex: c.color_hex,
      sort_order: c.sort_order,
    }));
    const { data: inserted } = await client
      .from('establishment_categories')
      .insert(seedRows)
      .select('*');
    if (inserted && inserted.length > 0) {
      establishmentCategories = inserted.map((r: Record<string, unknown>, i: number) => ({
        id: String(r.id ?? `cat-${i}`),
        name: String(r.name ?? ''),
        description: String(r.description ?? ''),
        color_hex: String(r.color_hex ?? '#0F766E'),
        sort_order: Number(r.sort_order ?? i + 1),
      }));
    }
  }

  let petTypes = DEFAULT_PET_TYPES;
  if (petRes.error) {
    if (isMissingTableError(petRes.error)) {
      missingTables.push('pet_types');
    }
  } else if (petRes.data && petRes.data.length > 0) {
    petTypes = petRes.data.map((r: Record<string, unknown>, i: number) => ({
      id: String(r.id ?? `pet-${i}`),
      name: String(r.name ?? ''),
      description: String(r.description ?? ''),
      sort_order: Number(r.sort_order ?? i + 1),
    }));
  } else {
    const seedRows = DEFAULT_PET_TYPES.map((p) => ({
      name: p.name,
      description: p.description,
      sort_order: p.sort_order,
    }));
    const { data: inserted } = await client.from('pet_types').insert(seedRows).select('*');
    if (inserted && inserted.length > 0) {
      petTypes = inserted.map((r: Record<string, unknown>, i: number) => ({
        id: String(r.id ?? `pet-${i}`),
        name: String(r.name ?? ''),
        description: String(r.description ?? ''),
        sort_order: Number(r.sort_order ?? i + 1),
      }));
    }
  }

  let serviceCategories = DEFAULT_SERVICE_CATEGORIES;
  if (svcCatRes.error) {
    if (isMissingTableError(svcCatRes.error)) {
      missingTables.push('service_categories');
    }
  } else if (svcCatRes.data && svcCatRes.data.length > 0) {
    serviceCategories = svcCatRes.data.map((r: Record<string, unknown>, i: number) => ({
      id: String(r.id ?? `svc-cat-${i}`),
      name: String(r.name ?? ''),
      description: String(r.description ?? ''),
      sort_order: Number(r.sort_order ?? i + 1),
    }));
  } else {
    const seedRows = DEFAULT_SERVICE_CATEGORIES.map((s) => ({
      name: s.name,
      description: s.description,
      sort_order: s.sort_order,
    }));
    const { data: inserted } = await client
      .from('service_categories')
      .insert(seedRows)
      .select('*');
    if (inserted && inserted.length > 0) {
      serviceCategories = inserted.map((r: Record<string, unknown>, i: number) => ({
        id: String(r.id ?? `svc-cat-${i}`),
        name: String(r.name ?? ''),
        description: String(r.description ?? ''),
        sort_order: Number(r.sort_order ?? i + 1),
      }));
    }
  }

  let suggestedQueries = DEFAULT_SUGGESTED_QUERY_ITEMS;
  if (queryRes.error) {
    if (isMissingTableError(queryRes.error)) {
      missingTables.push('suggested_queries');
    }
  } else if (queryRes.data && queryRes.data.length > 0) {
    suggestedQueries = queryRes.data.map((r: Record<string, unknown>, i: number) => ({
      id: String(r.id ?? `query-${i}`),
      question: String(r.question ?? ''),
      category: String(r.category ?? 'General'),
      sort_order: Number(r.sort_order ?? i + 1),
    }));
  } else {
    const seedRows = DEFAULT_SUGGESTED_QUERY_ITEMS.map((q) => ({
      question: q.question,
      category: q.category,
      sort_order: q.sort_order,
      is_active: true,
    }));
    const { data: inserted } = await client
      .from('suggested_queries')
      .insert(seedRows)
      .select('*');
    if (inserted && inserted.length > 0) {
      suggestedQueries = inserted.map((r: Record<string, unknown>, i: number) => ({
        id: String(r.id ?? `query-${i}`),
        question: String(r.question ?? ''),
        category: String(r.category ?? 'General'),
        sort_order: Number(r.sort_order ?? i + 1),
      }));
    }
  }

  return {
    establishmentCategories,
    petTypes,
    serviceCategories,
    suggestedQueries,
    missingTables,
  };
}

function readLocalChatStore(): Record<string, ChatTurn[]> {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(LOCAL_CHAT_PATH)) {
    return {};
  }
  try {
    const raw = fs.readFileSync(LOCAL_CHAT_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as Record<string, ChatTurn[]>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeLocalChatStore(store: Record<string, ChatTurn[]>): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(LOCAL_CHAT_PATH, JSON.stringify(store, null, 2), 'utf-8');
}

export async function listChatMessages(sessionId: string): Promise<ChatTurn[]> {
  const safeSession = sessionId.trim() || 'default';
  const client = await resolveWorkingSupabase();

  if (client) {
    const { data, error } = await client
      .from('chat_messages')
      .select('*')
      .eq('session_id', safeSession)
      .order('created_at', { ascending: true })
      .limit(100);

    if (!error && data) {
      return data.map((row: Record<string, unknown>) => ({
        id: String(row.id ?? ''),
        role: row.role === 'user' ? 'user' : 'assistant',
        content: String(row.content ?? ''),
        referencedEstablishments: Array.isArray(row.referenced_establishments)
          ? (row.referenced_establishments as ReferencedEstablishmentSummary[])
          : [],
        created_at: row.created_at ? String(row.created_at) : undefined,
      }));
    }

    if (error && !isMissingTableError(error)) {
      throw new Error(
        formatSupabaseError('Error al consultar mensajes del asistente en Supabase', error)
      );
    }
  }

  const localStore = readLocalChatStore();
  return localStore[safeSession] ?? [];
}

export async function saveChatTurn(
  sessionId: string,
  role: 'user' | 'assistant',
  content: string,
  referencedEstablishments: ReferencedEstablishmentSummary[] = []
): Promise<void> {
  const safeSession = sessionId.trim() || 'default';
  const client = await resolveWorkingSupabase();

  if (client) {
    const { error } = await client.from('chat_messages').insert({
      session_id: safeSession,
      role,
      content,
      referenced_establishments: referencedEstablishments,
    });

    if (!error) return;
    if (!isMissingTableError(error)) {
      throw new Error(
        formatSupabaseError('Error al guardar mensaje en Supabase', error)
      );
    }
  }

  const localStore = readLocalChatStore();
  if (!localStore[safeSession]) {
    localStore[safeSession] = [];
  }
  localStore[safeSession].push({
    id: crypto.randomUUID(),
    role,
    content,
    referencedEstablishments,
    created_at: new Date().toISOString(),
  });
  writeLocalChatStore(localStore);
}

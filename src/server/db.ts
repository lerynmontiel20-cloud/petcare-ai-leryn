import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type {
  Establishment,
  EstablishmentCategory,
  EstablishmentInput,
  PetService,
} from '../types/petcare.ts';
import { SEED_ESTABLISHMENTS } from './seedData.ts';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const LOCAL_STORE_PATH = path.join(DATA_DIR, 'petcare-store.json');

let supabaseClient: SupabaseClient | null = null;
let supabaseSeeded = false;

function getSupabaseConfig(): { url: string; key: string } | null {
  const url = process.env.SUPABASE_URL?.trim();
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.SUPABASE_ANON_KEY?.trim();

  if (!url || !key) {
    return null;
  }
  return { url, key };
}

function getSupabase(): SupabaseClient | null {
  const config = getSupabaseConfig();
  if (!config) return null;

  if (!supabaseClient) {
    supabaseClient = createClient(config.url, config.key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }
  return supabaseClient;
}

export function isSupabaseConfigured(): boolean {
  return getSupabaseConfig() !== null;
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

  const { count, error } = await client
    .from('establishments')
    .select('id', { count: 'exact', head: true });

  if (error) {
    throw new Error(`Error al consultar Supabase: ${error.message}`);
  }

  if ((count ?? 0) === 0) {
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
          `Error al insertar semilla en Supabase: ${estErr?.message ?? 'sin respuesta'}`
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
          throw new Error(`Error al insertar servicios semilla: ${svcErr.message}`);
        }
      }
    }
  }

  supabaseSeeded = true;
}

function normalizeEstablishmentRow(row: Record<string, unknown>): Establishment {
  const rawServices = Array.isArray(row.services) ? row.services : [];
  const services: PetService[] = rawServices.map((s: Record<string, unknown>) => ({
    id: String(s.id ?? ''),
    establishment_id: String(s.establishment_id ?? row.id ?? ''),
    name: String(s.name ?? ''),
    category: String(s.category ?? ''),
    pet_type: String(s.pet_type ?? ''),
    price_pyg: Number(s.price_pyg ?? 0),
    duration_minutes:
      s.duration_minutes === null || s.duration_minutes === undefined
        ? null
        : Number(s.duration_minutes),
    description: String(s.description ?? ''),
    created_at: s.created_at ? String(s.created_at) : undefined,
  }));

  return {
    id: String(row.id ?? ''),
    name: String(row.name ?? ''),
    category: row.category as EstablishmentCategory,
    address: String(row.address ?? ''),
    phone: String(row.phone ?? ''),
    hours: String(row.hours ?? ''),
    latitude: Number(row.latitude ?? 0),
    longitude: Number(row.longitude ?? 0),
    pet_types: Array.isArray(row.pet_types) ? row.pet_types.map(String) : [],
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
  const client = getSupabase();

  if (client) {
    await ensureSupabaseSeeded(client);
    const { data, error } = await client
      .from('establishments')
      .select('*, services(*)')
      .order('created_at', { ascending: true });

    if (error) {
      throw new Error(`Error al listar establecimientos en Supabase: ${error.message}`);
    }

    const list = (data ?? []).map((row) =>
      normalizeEstablishmentRow(row as Record<string, unknown>)
    );
    return filterEstablishmentsList(list, filters);
  }

  const localList = readLocalStore();
  return filterEstablishmentsList(localList, filters);
}

export async function getEstablishmentById(
  id: string
): Promise<Establishment | null> {
  const client = getSupabase();

  if (client) {
    await ensureSupabaseSeeded(client);
    const { data, error } = await client
      .from('establishments')
      .select('*, services(*)')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      throw new Error(`Error al obtener establecimiento: ${error.message}`);
    }
    return data ? normalizeEstablishmentRow(data as Record<string, unknown>) : null;
  }

  const localList = readLocalStore();
  return localList.find((item) => item.id === id) ?? null;
}

export async function createEstablishment(
  input: EstablishmentInput
): Promise<Establishment> {
  const client = getSupabase();

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
        `Error al crear establecimiento en Supabase: ${estErr?.message ?? 'sin respuesta'}`
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
        throw new Error(`Error al registrar servicios en Supabase: ${svcErr.message}`);
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
  const client = getSupabase();

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
      throw new Error(`Error al actualizar establecimiento: ${estErr.message}`);
    }
    if (!updatedEst) {
      return null;
    }

    const { error: delSvcErr } = await client
      .from('services')
      .delete()
      .eq('establishment_id', id);

    if (delSvcErr) {
      throw new Error(`Error al actualizar servicios: ${delSvcErr.message}`);
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
        throw new Error(`Error al guardar servicios actualizados: ${insSvcErr.message}`);
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
  const client = getSupabase();

  if (client) {
    await ensureSupabaseSeeded(client);
    const { data, error } = await client
      .from('establishments')
      .delete()
      .eq('id', id)
      .select('id');

    if (error) {
      throw new Error(`Error al eliminar establecimiento: ${error.message}`);
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

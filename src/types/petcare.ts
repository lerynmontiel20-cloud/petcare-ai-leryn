export type EstablishmentCategory =
  | 'Veterinaria'
  | 'Peluquería Canina'
  | 'Tienda de Mascotas';

export const ESTABLISHMENT_CATEGORIES: EstablishmentCategory[] = [
  'Veterinaria',
  'Peluquería Canina',
  'Tienda de Mascotas',
];

export const PET_TYPES = [
  'Perros',
  'Gatos',
  'Pequeños Animales',
  'Aves y Roedores',
] as const;

export const SERVICE_CATEGORIES = [
  'Consulta Veterinaria',
  'Vacunación',
  'Urgencias',
  'Diagnóstico',
  'Peluquería Canina',
  'Peluquería Felina',
  'Higiene',
  'Accesorios y Alimentos',
] as const;

export interface PetService {
  id: string;
  establishment_id: string;
  name: string;
  category: string;
  pet_type: string;
  price_pyg: number;
  duration_minutes: number | null;
  description: string;
  created_at?: string;
}

export interface Establishment {
  id: string;
  name: string;
  category: EstablishmentCategory;
  address: string;
  phone: string;
  hours: string;
  latitude: number;
  longitude: number;
  pet_types: string[];
  description: string;
  created_at?: string;
  updated_at?: string;
  services: PetService[];
}

export interface ServiceInput {
  id?: string;
  name: string;
  category: string;
  pet_type: string;
  price_pyg: number;
  duration_minutes: number | null;
  description: string;
}

export interface EstablishmentInput {
  name: string;
  category: EstablishmentCategory;
  address: string;
  phone: string;
  hours: string;
  latitude: number;
  longitude: number;
  pet_types: string[];
  description: string;
  services: ServiceInput[];
}

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
  referencedEstablishments?: Array<{
    id: string;
    name: string;
    category: EstablishmentCategory;
    address: string;
  }>;
}

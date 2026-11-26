export type EstablishmentCategory =
  | 'Veterinaria'
  | 'Peluquería Canina'
  | 'Tienda de Mascotas'
  | (string & {});

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

export const DEFAULT_SUGGESTED_QUERIES = [
  '¿Qué cuidados básicos necesita un cachorro?',
  '¿Qué establecimientos ofrecen peluquería canina?',
  '¿Qué accesorios necesita un gato?',
] as const;

export interface EstablishmentCategoryItem {
  id: string;
  name: string;
  description: string;
  color_hex: string;
  sort_order: number;
}

export interface PetTypeItem {
  id: string;
  name: string;
  description: string;
  sort_order: number;
}

export interface ServiceCategoryItem {
  id: string;
  name: string;
  description: string;
  sort_order: number;
}

export interface SuggestedQueryItem {
  id: string;
  question: string;
  category: string;
  sort_order: number;
}

export interface CatalogMetadata {
  establishmentCategories: EstablishmentCategoryItem[];
  petTypes: PetTypeItem[];
  serviceCategories: ServiceCategoryItem[];
  suggestedQueries: SuggestedQueryItem[];
  missingTables: string[];
}

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

export interface ReferencedEstablishmentSummary {
  id: string;
  name: string;
  category: EstablishmentCategory;
  address: string;
}

export interface ChatTurn {
  id?: string;
  role: 'user' | 'assistant';
  content: string;
  referencedEstablishments?: ReferencedEstablishmentSummary[];
  created_at?: string;
}

import type { EstablishmentCategory } from '../types/petcare.ts';

export function formatPyg(amount: number): string {
  return `Gs. ${Math.round(amount).toLocaleString('es-PY')}`;
}

export function getCategoryVisuals(category: EstablishmentCategory): {
  pinBg: string;
  pinBorder: string;
  pinGlyph: string;
  textClass: string;
  dotClass: string;
} {
  switch (category) {
    case 'Veterinaria':
      return {
        pinBg: '#0F766E',
        pinBorder: '#115E59',
        pinGlyph: '#FFFFFF',
        textClass: 'text-teal-700',
        dotClass: 'bg-teal-700',
      };
    case 'Peluquería Canina':
      return {
        pinBg: '#B45309',
        pinBorder: '#92400E',
        pinGlyph: '#FFFFFF',
        textClass: 'text-amber-700',
        dotClass: 'bg-amber-600',
      };
    case 'Tienda de Mascotas':
      return {
        pinBg: '#4338CA',
        pinBorder: '#3730A3',
        pinGlyph: '#FFFFFF',
        textClass: 'text-indigo-700',
        dotClass: 'bg-indigo-700',
      };
  }
}

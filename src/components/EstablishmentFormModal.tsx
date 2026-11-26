import { Plus, Trash2, X } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import {
  ESTABLISHMENT_CATEGORIES,
  PET_TYPES,
  SERVICE_CATEGORIES,
  type Establishment,
  type EstablishmentCategory,
  type EstablishmentInput,
  type ServiceInput,
} from '../types/petcare.ts';
import { CoordinatePickerMap } from './PetMap.tsx';

interface EstablishmentFormModalProps {
  open: boolean;
  mapsApiKey: string;
  editingEstablishment: Establishment | null;
  establishmentCategories?: string[];
  petTypeOptions?: string[];
  serviceCategories?: string[];
  onClose: () => void;
  onSubmit: (data: EstablishmentInput, editingId?: string) => Promise<void>;
}

function emptyService(defaultCategory = 'Consulta Veterinaria'): ServiceInput {
  return {
    name: '',
    category: defaultCategory,
    pet_type: 'Perros y Gatos',
    price_pyg: 90000,
    duration_minutes: 30,
    description: '',
  };
}

export function EstablishmentFormModal({
  open,
  mapsApiKey,
  editingEstablishment,
  establishmentCategories = [],
  petTypeOptions = [],
  serviceCategories = [],
  onClose,
  onSubmit,
}: EstablishmentFormModalProps) {
  const categoryOptions =
    establishmentCategories.length > 0
      ? establishmentCategories
      : ESTABLISHMENT_CATEGORIES;
  const availablePetTypes =
    petTypeOptions.length > 0 ? petTypeOptions : [...PET_TYPES];
  const availableServiceCategories =
    serviceCategories.length > 0 ? serviceCategories : [...SERVICE_CATEGORIES];
  const [name, setName] = useState('');
  const [category, setCategory] = useState<EstablishmentCategory>('Veterinaria');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [hours, setHours] = useState('Lun a Sáb: 08:00 - 19:00');
  const [latitude, setLatitude] = useState('-25.2886');
  const [longitude, setLongitude] = useState('-57.6054');
  const [petTypes, setPetTypes] = useState<string[]>(['Perros', 'Gatos']);
  const [description, setDescription] = useState('');
  const [services, setServices] = useState<ServiceInput[]>([emptyService()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (editingEstablishment) {
      setName(editingEstablishment.name);
      setCategory(editingEstablishment.category);
      setAddress(editingEstablishment.address);
      setPhone(editingEstablishment.phone);
      setHours(editingEstablishment.hours);
      setLatitude(String(editingEstablishment.latitude));
      setLongitude(String(editingEstablishment.longitude));
      setPetTypes(
        editingEstablishment.pet_types.length > 0
          ? editingEstablishment.pet_types
          : ['Perros']
      );
      setDescription(editingEstablishment.description);
      setServices(
        editingEstablishment.services.length > 0
          ? editingEstablishment.services.map((s) => ({
              id: s.id,
              name: s.name,
              category: s.category,
              pet_type: s.pet_type,
              price_pyg: s.price_pyg,
              duration_minutes: s.duration_minutes,
              description: s.description,
            }))
          : [emptyService()]
      );
    } else {
      setName('');
      setCategory('Veterinaria');
      setAddress('');
      setPhone('+595 ');
      setHours('Lun a Sáb: 08:00 - 19:00');
      setLatitude('-25.2886');
      setLongitude('-57.6054');
      setPetTypes(['Perros', 'Gatos']);
      setDescription('');
      setServices([emptyService()]);
    }
  }, [open, editingEstablishment]);

  if (!open) return null;

  const togglePetType = (pet: string) => {
    setPetTypes((prev) =>
      prev.includes(pet) ? prev.filter((item) => item !== pet) : [...prev, pet]
    );
  };

  const updateService = (index: number, patch: Partial<ServiceInput>) => {
    setServices((prev) =>
      prev.map((item, idx) => (idx === index ? { ...item, ...patch } : item))
    );
  };

  const addServiceRow = () => {
    setServices((prev) => [
      ...prev,
      emptyService(availableServiceCategories[0] || 'Consulta Veterinaria'),
    ]);
  };

  const removeServiceRow = (index: number) => {
    setServices((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const latNum = Number(latitude);
    const lngNum = Number(longitude);
    if (!Number.isFinite(latNum) || latNum < -90 || latNum > 90) {
      setError('Ingresá una latitud válida entre -90 y 90.');
      return;
    }
    if (!Number.isFinite(lngNum) || lngNum < -180 || lngNum > 180) {
      setError('Ingresá una longitud válida entre -180 y 180.');
      return;
    }
    if (petTypes.length === 0) {
      setError('Seleccioná al menos un tipo de mascota.');
      return;
    }

    const validServices = services
      .filter((s) => s.name.trim().length > 0)
      .map((s) => ({
        ...s,
        name: s.name.trim(),
        category: s.category.trim() || 'Consulta Veterinaria',
        pet_type: s.pet_type.trim() || 'Perros y Gatos',
        price_pyg: Math.max(0, Math.round(Number(s.price_pyg) || 0)),
        duration_minutes:
          s.duration_minutes === null || Number(s.duration_minutes) <= 0
            ? null
            : Math.round(Number(s.duration_minutes)),
        description: s.description.trim(),
      }));

    const payload: EstablishmentInput = {
      name: name.trim(),
      category,
      address: address.trim(),
      phone: phone.trim(),
      hours: hours.trim(),
      latitude: latNum,
      longitude: lngNum,
      pet_types: petTypes,
      description: description.trim(),
      services: validServices,
    };

    setSaving(true);
    try {
      await onSubmit(payload, editingEstablishment?.id);
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'No se pudo guardar el registro.'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-[1px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="form-modal-title"
    >
      <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
          <div>
            <h2
              id="form-modal-title"
              className="font-display text-lg font-bold text-slate-900"
            >
              {editingEstablishment
                ? 'Editar establecimiento'
                : 'Registrar nuevo establecimiento'}
            </h2>
            <p className="text-xs text-slate-500">
              Completá los datos del local, su ubicación en el mapa y el catálogo de servicios.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar formulario"
            className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6 px-6 py-5">
          {error && (
            <div
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs font-medium text-red-800"
            >
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-slate-700">
                Nombre del establecimiento
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej. Veterinaria Central Asunción"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/20"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700">
                Tipo de establecimiento
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as EstablishmentCategory)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/20"
              >
                {categoryOptions.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700">
                Dirección
              </label>
              <input
                type="text"
                required
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Ej. Av. Mariscal López 1420, Asunción"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/20"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700">
                Contacto / Teléfono
              </label>
              <input
                type="text"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Ej. +595 981 123 456"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/20"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700">
                Horario de atención
              </label>
              <input
                type="text"
                required
                value={hours}
                onChange={(e) => setHours(e.target.value)}
                placeholder="Ej. Lun a Sáb: 08:00 - 19:00"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/20"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700">
                Descripción breve
              </label>
              <textarea
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Especialidades, atención de urgencias, enfoque del local..."
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/20"
              />
            </div>
          </div>

          <div>
            <span className="block text-xs font-medium text-slate-700">
              Tipos de mascotas que atiende
            </span>
            <div className="mt-2 flex flex-wrap gap-2">
              {availablePetTypes.map((pet) => {
                const active = petTypes.includes(pet);
                return (
                  <button
                    key={pet}
                    type="button"
                    onClick={() => togglePetType(pet)}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                      active
                        ? 'border-teal-700 bg-teal-50 text-teal-800'
                        : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {pet}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-3 border-t border-slate-200 pt-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-slate-700">
                  Latitud
                </label>
                <input
                  type="number"
                  step="any"
                  required
                  value={latitude}
                  onChange={(e) => setLatitude(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono-tabular text-sm text-slate-900 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/20"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700">
                  Longitud
                </label>
                <input
                  type="number"
                  step="any"
                  required
                  value={longitude}
                  onChange={(e) => setLongitude(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono-tabular text-sm text-slate-900 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/20"
                />
              </div>
            </div>

            <CoordinatePickerMap
              mapsApiKey={mapsApiKey}
              latitude={Number(latitude)}
              longitude={Number(longitude)}
              onChange={(lat, lng) => {
                setLatitude(String(lat));
                setLongitude(String(lng));
              }}
            />
          </div>

          <div className="space-y-3 border-t border-slate-200 pt-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-display text-sm font-semibold text-slate-900">
                  Servicios, precios y duración
                </h3>
                <p className="text-xs text-slate-500">
                  Agregá los servicios o productos principales ofrecidos en este establecimiento.
                </p>
              </div>
              <button
                type="button"
                onClick={addServiceRow}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
              >
                <Plus className="h-3.5 w-3.5" />
                Agregar servicio
              </button>
            </div>

            <div className="space-y-3">
              {services.map((svc, idx) => (
                <div
                  key={idx}
                  className="rounded-lg border border-slate-200 bg-slate-50/70 p-3"
                >
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
                    <div className="sm:col-span-5">
                      <label className="block text-[11px] font-medium text-slate-600">
                        Nombre del servicio
                      </label>
                      <input
                        type="text"
                        value={svc.name}
                        onChange={(e) =>
                          updateService(idx, { name: e.target.value })
                        }
                        placeholder="Ej. Baño y corte canino"
                        className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-teal-700 focus:outline-none"
                      />
                    </div>

                    <div className="sm:col-span-3">
                      <label className="block text-[11px] font-medium text-slate-600">
                        Rubro / Categoría
                      </label>
                      <select
                        value={svc.category}
                        onChange={(e) =>
                          updateService(idx, { category: e.target.value })
                        }
                        className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900 focus:border-teal-700 focus:outline-none"
                      >
                        {availableServiceCategories.map((cat) => (
                          <option key={cat} value={cat}>
                            {cat}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block text-[11px] font-medium text-slate-600">
                        Precio (Gs.)
                      </label>
                      <input
                        type="number"
                        min={0}
                        step={1000}
                        value={svc.price_pyg}
                        onChange={(e) =>
                          updateService(idx, {
                            price_pyg: Number(e.target.value),
                          })
                        }
                        className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 font-mono-tabular text-xs text-slate-900 focus:border-teal-700 focus:outline-none"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block text-[11px] font-medium text-slate-600">
                        Duración (min)
                      </label>
                      <input
                        type="number"
                        min={1}
                        value={svc.duration_minutes ?? ''}
                        onChange={(e) =>
                          updateService(idx, {
                            duration_minutes: e.target.value
                              ? Number(e.target.value)
                              : null,
                          })
                        }
                        placeholder="Opcional"
                        className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 font-mono-tabular text-xs text-slate-900 focus:border-teal-700 focus:outline-none"
                      />
                    </div>

                    <div className="sm:col-span-4">
                      <label className="block text-[11px] font-medium text-slate-600">
                        Mascota objetivo
                      </label>
                      <input
                        type="text"
                        value={svc.pet_type}
                        onChange={(e) =>
                          updateService(idx, { pet_type: e.target.value })
                        }
                        placeholder="Ej. Perros y Gatos"
                        className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-teal-700 focus:outline-none"
                      />
                    </div>

                    <div className="sm:col-span-7">
                      <label className="block text-[11px] font-medium text-slate-600">
                        Detalle del servicio
                      </label>
                      <input
                        type="text"
                        value={svc.description}
                        onChange={(e) =>
                          updateService(idx, { description: e.target.value })
                        }
                        placeholder="Qué incluye este servicio..."
                        className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-teal-700 focus:outline-none"
                      />
                    </div>

                    <div className="flex items-end justify-end sm:col-span-1">
                      <button
                        type="button"
                        onClick={() => removeServiceRow(idx)}
                        disabled={services.length === 1}
                        aria-label="Quitar servicio"
                        className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-700 disabled:opacity-30"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-slate-200 pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-teal-700 px-5 py-2 text-xs font-medium text-white transition-colors hover:bg-teal-800 disabled:opacity-60 whitespace-nowrap"
            >
              {saving
                ? 'Guardando...'
                : editingEstablishment
                ? 'Guardar cambios'
                : 'Registrar establecimiento'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

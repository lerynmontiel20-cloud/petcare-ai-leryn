import { Eye, MapPin, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { Establishment } from '../types/petcare.ts';
import { formatPyg, getCategoryVisuals } from '../utils/format.ts';

interface CatalogManagementTableProps {
  establishments: Establishment[];
  loading: boolean;
  onCreate: () => void;
  onView: (est: Establishment) => void;
  onEdit: (est: Establishment) => void;
  onDelete: (id: string) => Promise<void>;
  onShowOnMap: (est: Establishment) => void;
}

export function CatalogManagementTable({
  establishments,
  loading,
  onCreate,
  onView,
  onEdit,
  onDelete,
  onShowOnMap,
}: CatalogManagementTableProps) {
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await onDelete(id);
      setPendingDeleteId(null);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h2 className="font-display text-lg font-bold text-slate-900">
            Gestión de Establecimientos y Servicios
          </h2>
          <p className="text-sm text-slate-600">
            Administrá altas, bajas, modificaciones y coordenadas geográficas almacenadas en la base de datos.
          </p>
        </div>
        <button
          type="button"
          onClick={onCreate}
          className="inline-flex items-center gap-1.5 self-start rounded-lg bg-teal-700 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-teal-800 whitespace-nowrap shrink-0"
        >
          <Plus className="h-4 w-4" />
          Nuevo establecimiento
        </button>
      </div>

      {loading ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <div className="space-y-3">
            {[1, 2, 3, 4].map((row) => (
              <div
                key={row}
                className="h-10 animate-pulse rounded bg-slate-100"
              />
            ))}
          </div>
        </div>
      ) : establishments.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center">
          <h3 className="font-display text-base font-semibold text-slate-900">
            No hay establecimientos que coincidan
          </h3>
          <p className="mt-1 text-sm text-slate-600">
            Probá limpiar los filtros o registrá un nuevo establecimiento en el sistema.
          </p>
          <button
            type="button"
            onClick={onCreate}
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-4 py-2 text-xs font-medium text-white hover:bg-teal-800 whitespace-nowrap"
          >
            <Plus className="h-4 w-4" />
            Registrar establecimiento
          </button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                  <th className="px-4 py-3">Establecimiento</th>
                  <th className="px-4 py-3">Categoría</th>
                  <th className="px-4 py-3">Contacto y horario</th>
                  <th className="px-4 py-3">Coordenadas</th>
                  <th className="px-4 py-3 text-right">Servicios</th>
                  <th className="px-4 py-3 text-right">Desde</th>
                  <th className="px-4 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {establishments.map((est) => {
                  const visuals = getCategoryVisuals(est.category);
                  const minPrice =
                    est.services.length > 0
                      ? Math.min(...est.services.map((s) => s.price_pyg))
                      : null;
                  const isConfirming = pendingDeleteId === est.id;

                  return (
                    <tr
                      key={est.id}
                      className="transition-colors hover:bg-slate-50/80"
                    >
                      <td className="px-4 py-3 align-top">
                        <div className="font-medium text-slate-900">{est.name}</div>
                        <div className="mt-0.5 text-xs text-slate-500">
                          {est.address}
                        </div>
                        <div className="mt-0.5 text-xs text-slate-500">
                          {est.pet_types.join(' · ')}
                        </div>
                      </td>
                      <td className="px-4 py-3 align-top whitespace-nowrap">
                        <span className={`text-xs font-medium ${visuals.textClass}`}>
                          {est.category}
                        </span>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <div className="tabular-nums text-xs font-medium text-slate-700">
                          {est.phone}
                        </div>
                        <div className="mt-0.5 text-xs text-slate-500">{est.hours}</div>
                      </td>
                      <td className="px-4 py-3 align-top font-mono-tabular text-xs text-slate-500 whitespace-nowrap">
                        {est.latitude.toFixed(4)}, {est.longitude.toFixed(4)}
                      </td>
                      <td className="px-4 py-3 align-top text-right tabular-nums text-xs font-medium text-slate-700">
                        {est.services.length}
                      </td>
                      <td className="px-4 py-3 align-top text-right font-mono-tabular text-xs font-medium text-slate-900 whitespace-nowrap">
                        {minPrice !== null ? formatPyg(minPrice) : '—'}
                      </td>
                      <td className="px-4 py-3 align-top text-right whitespace-nowrap">
                        {isConfirming ? (
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setPendingDeleteId(null)}
                              disabled={deletingId === est.id}
                              className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
                            >
                              Cancelar
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(est.id)}
                              disabled={deletingId === est.id}
                              className="rounded bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                            >
                              {deletingId === est.id ? 'Borrando...' : 'Confirmar'}
                            </button>
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => onShowOnMap(est)}
                              title="Ver en mapa"
                              aria-label={`Ver ${est.name} en mapa`}
                              className="rounded-md p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-teal-700"
                            >
                              <MapPin className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => onView(est)}
                              title="Ver ficha completa"
                              aria-label={`Ver ficha de ${est.name}`}
                              className="rounded-md p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
                            >
                              <Eye className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => onEdit(est)}
                              title="Editar"
                              aria-label={`Editar ${est.name}`}
                              className="rounded-md p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-teal-700"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setPendingDeleteId(est.id)}
                              title="Eliminar"
                              aria-label={`Eliminar ${est.name}`}
                              className="rounded-md p-1.5 text-slate-500 transition-colors hover:bg-red-50 hover:text-red-700"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

import { Clock, MapPin, Pencil, Phone, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import type { Establishment } from '../types/petcare.ts';
import { formatPyg, getCategoryVisuals } from '../utils/format.ts';

interface EstablishmentDetailModalProps {
  establishment: Establishment | null;
  onClose: () => void;
  onEdit: (establishment: Establishment) => void;
  onDelete: (id: string) => Promise<void>;
  onFocusOnMap: (establishment: Establishment) => void;
}

export function EstablishmentDetailModal({
  establishment,
  onClose,
  onEdit,
  onDelete,
  onFocusOnMap,
}: EstablishmentDetailModalProps) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  if (!establishment) return null;

  const visuals = getCategoryVisuals(establishment.category);

  const handleConfirmDelete = async () => {
    setDeleting(true);
    try {
      await onDelete(establishment.id);
      setConfirmingDelete(false);
      onClose();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-[1px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="detail-modal-title"
    >
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
              <span className={visuals.textClass}>{establishment.category}</span>
              <span aria-hidden="true">·</span>
              <span>{establishment.pet_types.join(', ')}</span>
            </div>
            <h2
              id="detail-modal-title"
              className="mt-1 font-display text-xl font-bold text-slate-900"
            >
              {establishment.name}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar ficha"
            className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-6 px-6 py-5">
          {establishment.description && (
            <p className="text-sm leading-relaxed text-slate-600">
              {establishment.description}
            </p>
          )}

          <div className="grid grid-cols-1 gap-3 border-y border-slate-100 py-4 text-sm text-slate-700 sm:grid-cols-2">
            <div className="flex items-start gap-2.5">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-teal-700" />
              <div>
                <div className="text-xs font-medium text-slate-500">Dirección</div>
                <div>{establishment.address}</div>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <Phone className="mt-0.5 h-4 w-4 shrink-0 text-teal-700" />
              <div>
                <div className="text-xs font-medium text-slate-500">Contacto</div>
                <div className="tabular-nums">{establishment.phone}</div>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <Clock className="mt-0.5 h-4 w-4 shrink-0 text-teal-700" />
              <div>
                <div className="text-xs font-medium text-slate-500">Horario de atención</div>
                <div>{establishment.hours}</div>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
              <div>
                <div className="text-xs font-medium text-slate-500">Coordenadas</div>
                <div className="font-mono-tabular text-xs text-slate-600">
                  {establishment.latitude.toFixed(6)}, {establishment.longitude.toFixed(6)}
                </div>
              </div>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <h3 className="font-display text-sm font-semibold text-slate-900">
                Catálogo de servicios y precios
              </h3>
              <span className="text-xs text-slate-500 tabular-nums">
                {establishment.services.length}{' '}
                {establishment.services.length === 1 ? 'servicio' : 'servicios'}
              </span>
            </div>

            {establishment.services.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">
                Este establecimiento aún no tiene servicios cargados.
              </p>
            ) : (
              <div className="mt-3 divide-y divide-slate-100 rounded-lg border border-slate-200">
                {establishment.services.map((svc) => (
                  <div
                    key={svc.id}
                    className="flex flex-col justify-between gap-2 px-4 py-3 sm:flex-row sm:items-center"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-slate-900">
                        {svc.name}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                        <span>{svc.category}</span>
                        <span aria-hidden="true">·</span>
                        <span>{svc.pet_type}</span>
                        {svc.duration_minutes !== null && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="tabular-nums">{svc.duration_minutes} min</span>
                          </>
                        )}
                      </div>
                      {svc.description && (
                        <p className="mt-1 text-xs text-slate-600">{svc.description}</p>
                      )}
                    </div>
                    <div className="shrink-0 font-mono-tabular text-sm font-semibold text-teal-800">
                      {formatPyg(svc.price_pyg)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4">
          {confirmingDelete ? (
            <div className="flex w-full flex-wrap items-center justify-between gap-3">
              <span className="text-xs font-medium text-red-700">
                ¿Confirmás eliminar "{establishment.name}" y todos sus servicios?
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(false)}
                  disabled={deleting}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDelete}
                  disabled={deleting}
                  className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50 whitespace-nowrap"
                >
                  {deleting ? 'Eliminando...' : 'Sí, eliminar'}
                </button>
              </div>
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-medium text-red-700 transition-colors hover:bg-red-50 whitespace-nowrap"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Eliminar
              </button>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onFocusOnMap(establishment);
                    onClose();
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap"
                >
                  <MapPin className="h-3.5 w-3.5 text-teal-700" />
                  Ubicar en el mapa
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onEdit(establishment);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-teal-800 whitespace-nowrap"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Editar registro
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

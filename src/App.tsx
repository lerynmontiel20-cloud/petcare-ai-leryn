import { APIProvider } from '@vis.gl/react-google-maps';
import {
  Clock,
  Eye,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Search,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AssistantPanel } from './components/AssistantPanel.tsx';
import { CatalogManagementTable } from './components/CatalogManagementTable.tsx';
import { EstablishmentDetailModal } from './components/EstablishmentDetailModal.tsx';
import { EstablishmentFormModal } from './components/EstablishmentFormModal.tsx';
import { PetMap } from './components/PetMap.tsx';
import {
  ESTABLISHMENT_CATEGORIES,
  PET_TYPES,
  SERVICE_CATEGORIES,
  type Establishment,
  type EstablishmentInput,
} from './types/petcare.ts';
import { formatPyg, getCategoryVisuals } from './utils/format.ts';

type ActiveView = 'catalog' | 'manage' | 'assistant';

export default function App() {
  const [activeView, setActiveView] = useState<ActiveView>('catalog');
  const [establishments, setEstablishments] = useState<Establishment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [quotaExceeded, setQuotaExceeded] = useState(false);

  const [mapsApiKey, setMapsApiKey] = useState<string>(
    (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined)?.trim() || ''
  );

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('Todos');
  const [selectedPetType, setSelectedPetType] = useState<string>('todas');
  const [selectedServiceCategory, setSelectedServiceCategory] =
    useState<string>('todos');

  // Selection & Modals
  const [selectedMapId, setSelectedMapId] = useState<string | null>(null);
  const [detailTarget, setDetailTarget] = useState<Establishment | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingTarget, setEditingTarget] = useState<Establishment | null>(null);

  useEffect(() => {
    const onQuotaExceeded = () => setQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', onQuotaExceeded);
    return () => window.removeEventListener('gmp-quota-exceeded', onQuotaExceeded);
  }, []);

  useEffect(() => {
    if (mapsApiKey) return;
    fetch('/api/public-config')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { mapsApiKey?: string } | null) => {
        if (data?.mapsApiKey) {
          setMapsApiKey(data.mapsApiKey);
        }
      })
      .catch(() => {
        // Ignored: PetMap handles empty key cleanly
      });
  }, [mapsApiKey]);

  const fetchEstablishments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/establishments');
      const data = (await res.json()) as {
        establishments?: Establishment[];
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error || 'Error al cargar los establecimientos.');
      }
      setEstablishments(data.establishments ?? []);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'No se pudieron cargar los establecimientos.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchEstablishments();
  }, [fetchEstablishments]);

  const filteredEstablishments = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const pet = selectedPetType.toLowerCase();
    const svcCat = selectedServiceCategory.toLowerCase();

    return establishments.filter((est) => {
      if (selectedCategory !== 'Todos' && est.category !== selectedCategory) {
        return false;
      }

      if (pet !== 'todas') {
        const matchesEst = est.pet_types.some((pt) =>
          pt.toLowerCase().includes(pet)
        );
        const matchesSvc = est.services.some((s) => {
          const sp = s.pet_type.toLowerCase();
          return (
            sp.includes(pet) ||
            sp.includes('todas') ||
            (pet === 'perros' && sp.includes('perro')) ||
            (pet === 'gatos' && sp.includes('gato'))
          );
        });
        if (!matchesEst && !matchesSvc) return false;
      }

      if (svcCat !== 'todos') {
        const matchesServiceCat = est.services.some(
          (s) =>
            s.category.toLowerCase().includes(svcCat) ||
            s.name.toLowerCase().includes(svcCat)
        );
        if (!matchesServiceCat) return false;
      }

      if (q) {
        const matchesEst =
          est.name.toLowerCase().includes(q) ||
          est.address.toLowerCase().includes(q) ||
          est.category.toLowerCase().includes(q) ||
          est.description.toLowerCase().includes(q) ||
          est.hours.toLowerCase().includes(q);
        const matchesSvc = est.services.some(
          (s) =>
            s.name.toLowerCase().includes(q) ||
            s.category.toLowerCase().includes(q) ||
            s.description.toLowerCase().includes(q)
        );
        if (!matchesEst && !matchesSvc) return false;
      }

      return true;
    });
  }, [
    establishments,
    searchQuery,
    selectedCategory,
    selectedPetType,
    selectedServiceCategory,
  ]);

  const totalServicesCount = useMemo(
    () =>
      filteredEstablishments.reduce((acc, item) => acc + item.services.length, 0),
    [filteredEstablishments]
  );

  const hasActiveFilters =
    searchQuery.trim().length > 0 ||
    selectedCategory !== 'Todos' ||
    selectedPetType !== 'todas' ||
    selectedServiceCategory !== 'todos';

  const resetFilters = () => {
    setSearchQuery('');
    setSelectedCategory('Todos');
    setSelectedPetType('todas');
    setSelectedServiceCategory('todos');
  };

  const handleCreateClick = () => {
    setEditingTarget(null);
    setFormOpen(true);
  };

  const handleEditClick = (est: Establishment) => {
    setEditingTarget(est);
    setFormOpen(true);
  };

  const handleSaveEstablishment = async (
    payload: EstablishmentInput,
    editingId?: string
  ) => {
    const url = editingId
      ? `/api/establishments/${encodeURIComponent(editingId)}`
      : '/api/establishments';
    const method = editingId ? 'PUT' : 'POST';

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = (await res.json()) as {
      establishment?: Establishment;
      error?: string;
    };

    if (!res.ok || !data.establishment) {
      throw new Error(data.error || 'No se pudo guardar el establecimiento.');
    }

    const saved = data.establishment;
    setEstablishments((prev) => {
      if (editingId) {
        return prev.map((item) => (item.id === editingId ? saved : item));
      }
      return [...prev, saved];
    });
    setSelectedMapId(saved.id);
  };

  const handleDeleteEstablishment = async (id: string) => {
    const res = await fetch(`/api/establishments/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    const data = (await res.json()) as { deleted?: boolean; error?: string };
    if (!res.ok) {
      throw new Error(data.error || 'No se pudo eliminar el establecimiento.');
    }
    setEstablishments((prev) => prev.filter((item) => item.id !== id));
    if (selectedMapId === id) {
      setSelectedMapId(null);
    }
  };

  const handleFocusOnMap = (est: Establishment) => {
    setActiveView('catalog');
    setSelectedMapId(est.id);
  };

  const handleSelectFromAI = (id: string) => {
    resetFilters();
    setActiveView('catalog');
    setSelectedMapId(id);
  };

  const content = (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900">
      {quotaExceeded && (
        <div className="sticky top-0 z-50 border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-center text-xs text-amber-900 shadow-sm md:text-sm">
          <span>
            Google Maps Platform quota reached. If you are the app owner, visit{' '}
            <a
              href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-amber-950 underline hover:text-amber-800"
            >
              maps developer site
            </a>{' '}
            for instructions to update your account.
          </span>
        </div>
      )}

      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-8 px-4 py-3.5 sm:px-6">
          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              setActiveView('catalog');
            }}
            className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
          >
            PetCare AI
          </a>

          <nav
            aria-label="Navegación principal"
            className="hidden items-center gap-6 md:flex"
          >
            <button
              type="button"
              onClick={() => setActiveView('catalog')}
              className={`border-b-2 py-1 text-sm font-medium transition-colors whitespace-nowrap shrink-0 ${
                activeView === 'catalog'
                  ? 'border-teal-700 text-teal-800'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              Catálogo y Mapa
            </button>
            <button
              type="button"
              onClick={() => setActiveView('manage')}
              className={`border-b-2 py-1 text-sm font-medium transition-colors whitespace-nowrap shrink-0 ${
                activeView === 'manage'
                  ? 'border-teal-700 text-teal-800'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              Gestión de Registros
            </button>
            <button
              type="button"
              onClick={() => setActiveView('assistant')}
              className={`border-b-2 py-1 text-sm font-medium transition-colors whitespace-nowrap shrink-0 ${
                activeView === 'assistant'
                  ? 'border-teal-700 text-teal-800'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              Asistente IA
            </button>
          </nav>

          <div className="shrink-0">
            <button
              type="button"
              onClick={handleCreateClick}
              className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-3.5 py-2 text-xs font-medium text-white transition-colors hover:bg-teal-800 whitespace-nowrap shrink-0"
            >
              <Plus className="h-4 w-4" />
              Nuevo establecimiento
            </button>
          </div>
        </div>

        <nav
          aria-label="Navegación móvil"
          className="flex border-t border-slate-100 bg-white px-4 md:hidden"
        >
          <button
            type="button"
            onClick={() => setActiveView('catalog')}
            className={`flex-1 border-b-2 py-2.5 text-center text-xs font-medium whitespace-nowrap ${
              activeView === 'catalog'
                ? 'border-teal-700 text-teal-800'
                : 'border-transparent text-slate-600'
            }`}
          >
            Catálogo y Mapa
          </button>
          <button
            type="button"
            onClick={() => setActiveView('manage')}
            className={`flex-1 border-b-2 py-2.5 text-center text-xs font-medium whitespace-nowrap ${
              activeView === 'manage'
                ? 'border-teal-700 text-teal-800'
                : 'border-transparent text-slate-600'
            }`}
          >
            Registros
          </button>
          <button
            type="button"
            onClick={() => setActiveView('assistant')}
            className={`flex-1 border-b-2 py-2.5 text-center text-xs font-medium whitespace-nowrap ${
              activeView === 'assistant'
                ? 'border-teal-700 text-teal-800'
                : 'border-transparent text-slate-600'
            }`}
          >
            Asistente IA
          </button>
        </nav>
      </header>

      <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-6">
        {error && (
          <div
            role="alert"
            className="mb-5 flex items-center justify-between gap-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          >
            <span>{error}</span>
            <button
              type="button"
              onClick={() => void fetchEstablishments()}
              className="rounded-md border border-red-300 bg-white px-3 py-1 text-xs font-medium text-red-800 hover:bg-red-50 whitespace-nowrap"
            >
              Reintentar
            </button>
          </div>
        )}

        {activeView !== 'assistant' && (
          <section
            aria-label="Buscador y filtros"
            className="mb-6 rounded-xl border border-slate-200 bg-white p-4"
          >
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar por nombre, dirección, vacuna, peluquería canina o accesorio..."
                  className="w-full rounded-lg border border-slate-300 py-2 pr-3 pl-9 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/20"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1">
                  {(['Todos', ...ESTABLISHMENT_CATEGORIES] as const).map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setSelectedCategory(cat)}
                      className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                        selectedCategory === cat
                          ? 'bg-white text-slate-900 shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>

                <select
                  aria-label="Filtrar por tipo de mascota"
                  value={selectedPetType}
                  onChange={(e) => setSelectedPetType(e.target.value)}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 focus:border-teal-700 focus:outline-none"
                >
                  <option value="todas">Todas las mascotas</option>
                  {PET_TYPES.map((pet) => (
                    <option key={pet} value={pet}>
                      {pet}
                    </option>
                  ))}
                </select>

                <select
                  aria-label="Filtrar por servicio"
                  value={selectedServiceCategory}
                  onChange={(e) => setSelectedServiceCategory(e.target.value)}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 focus:border-teal-700 focus:outline-none"
                >
                  <option value="todos">Todos los servicios</option>
                  {SERVICE_CATEGORIES.map((svc) => (
                    <option key={svc} value={svc}>
                      {svc}
                    </option>
                  ))}
                </select>

                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={resetFilters}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 whitespace-nowrap"
                  >
                    <X className="h-3.5 w-3.5" />
                    Limpiar
                  </button>
                )}
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2.5 text-xs text-slate-500">
              <div className="tabular-nums">
                Mostrando{' '}
                <span className="font-semibold text-slate-800">
                  {filteredEstablishments.length}
                </span>{' '}
                {filteredEstablishments.length === 1
                  ? 'establecimiento'
                  : 'establecimientos'}{' '}
                <span aria-hidden="true">·</span>{' '}
                <span className="font-semibold text-slate-800">
                  {totalServicesCount}
                </span>{' '}
                {totalServicesCount === 1 ? 'servicio' : 'servicios'}
              </div>
              <button
                type="button"
                onClick={() => setActiveView('assistant')}
                className="font-medium text-teal-700 hover:text-teal-800 hover:underline whitespace-nowrap"
              >
                Consultar al asistente inteligente PetCare AI
              </button>
            </div>
          </section>
        )}

        {activeView === 'catalog' && (
          <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
            <section
              aria-label="Listado de establecimientos"
              className="space-y-3 lg:col-span-5"
            >
              {loading ? (
                <div className="space-y-3">
                  {[1, 2, 3, 4].map((n) => (
                    <div
                      key={n}
                      className="h-40 animate-pulse rounded-xl border border-slate-200 bg-white"
                    />
                  ))}
                </div>
              ) : filteredEstablishments.length === 0 ? (
                <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
                  <h2 className="font-display text-base font-semibold text-slate-900">
                    Sin resultados para tu búsqueda
                  </h2>
                  <p className="mt-1 text-sm text-slate-600">
                    Ajustá los filtros de mascota o servicio, o agregá un nuevo establecimiento.
                  </p>
                  <div className="mt-4 flex flex-wrap justify-center gap-2">
                    {hasActiveFilters && (
                      <button
                        type="button"
                        onClick={resetFilters}
                        className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        Restablecer filtros
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handleCreateClick}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-3.5 py-2 text-xs font-medium text-white hover:bg-teal-800"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Nuevo establecimiento
                    </button>
                  </div>
                </div>
              ) : (
                filteredEstablishments.map((est) => {
                  const visuals = getCategoryVisuals(est.category);
                  const isSelected = selectedMapId === est.id;
                  const minPrice =
                    est.services.length > 0
                      ? Math.min(...est.services.map((s) => s.price_pyg))
                      : null;

                  return (
                    <article
                      key={est.id}
                      onClick={() => setSelectedMapId(est.id)}
                      className={`cursor-pointer rounded-xl border bg-white p-4 transition-colors ${
                        isSelected
                          ? 'border-teal-700 ring-1 ring-teal-700/20'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                            <span className={`font-semibold ${visuals.textClass}`}>
                              {est.category}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>{est.pet_types.join(', ')}</span>
                          </div>
                          <h2 className="mt-1 font-display text-base font-bold text-slate-900">
                            {est.name}
                          </h2>
                        </div>
                        {minPrice !== null && (
                          <div className="shrink-0 text-right">
                            <div className="text-[11px] text-slate-400">Desde</div>
                            <div className="font-mono-tabular text-xs font-semibold text-teal-800">
                              {formatPyg(minPrice)}
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="mt-2.5 space-y-1 text-xs text-slate-600">
                        <p className="flex items-start gap-1.5">
                          <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                          <span>{est.address}</span>
                        </p>
                        <p className="flex items-start gap-1.5">
                          <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                          <span>{est.hours}</span>
                        </p>
                        <p className="flex items-start gap-1.5">
                          <Phone className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                          <span className="tabular-nums">{est.phone}</span>
                        </p>
                      </div>

                      {est.services.length > 0 && (
                        <div className="mt-3 border-t border-slate-100 pt-2.5 text-xs text-slate-600">
                          <span className="font-medium text-slate-700">Servicios: </span>
                          {est.services.map((s) => s.name).join(' · ')}
                        </div>
                      )}

                      <div
                        className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2.5"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() => setDetailTarget(est)}
                          className="inline-flex items-center gap-1 text-xs font-medium text-teal-700 hover:text-teal-800 hover:underline whitespace-nowrap"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          Ver ficha y precios ({est.services.length})
                        </button>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setSelectedMapId(est.id)}
                            className="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                          >
                            Ver en mapa
                          </button>
                          <button
                            type="button"
                            onClick={() => handleEditClick(est)}
                            className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                          >
                            <Pencil className="h-3 w-3" />
                            Editar
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })
              )}
            </section>

            <section
              aria-label="Mapa interactivo de establecimientos"
              className="lg:sticky lg:top-20 lg:col-span-7"
            >
              <div className="h-[460px] lg:h-[calc(100vh-14.5rem)] lg:min-h-[520px]">
                <PetMap
                  mapsApiKey={mapsApiKey}
                  establishments={filteredEstablishments}
                  selectedId={selectedMapId}
                  onSelect={setSelectedMapId}
                  onViewDetails={(est) => setDetailTarget(est)}
                />
              </div>
            </section>
          </div>
        )}

        {activeView === 'manage' && (
          <CatalogManagementTable
            establishments={filteredEstablishments}
            loading={loading}
            onCreate={handleCreateClick}
            onView={(est) => setDetailTarget(est)}
            onEdit={handleEditClick}
            onDelete={handleDeleteEstablishment}
            onShowOnMap={handleFocusOnMap}
          />
        )}

        {activeView === 'assistant' && (
          <AssistantPanel onSelectEstablishmentFromAI={handleSelectFromAI} />
        )}
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[1400px] flex-col justify-between gap-2 px-4 py-4 text-xs text-slate-500 sm:flex-row sm:items-center sm:px-6">
          <span>
            PetCare AI · Catálogo de veterinarias, peluquerías caninas y tiendas de mascotas
          </span>
          <span>
            Orientación general sobre mascotas sin sustituir la consulta veterinaria profesional.
          </span>
        </div>
      </footer>

      <EstablishmentDetailModal
        establishment={detailTarget}
        onClose={() => setDetailTarget(null)}
        onEdit={handleEditClick}
        onDelete={handleDeleteEstablishment}
        onFocusOnMap={handleFocusOnMap}
      />

      <EstablishmentFormModal
        open={formOpen}
        mapsApiKey={mapsApiKey}
        editingEstablishment={editingTarget}
        onClose={() => setFormOpen(false)}
        onSubmit={handleSaveEstablishment}
      />
    </div>
  );

  if (mapsApiKey) {
    return (
      <APIProvider
        apiKey={mapsApiKey}
        libraries={['marker']}
        language="es"
        region="PY"
      >
        {content}
      </APIProvider>
    );
  }

  return content;
}

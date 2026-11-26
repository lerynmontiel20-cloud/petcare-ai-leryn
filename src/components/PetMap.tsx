import {
  AdvancedMarker,
  APILoadingStatus,
  InfoWindow,
  Map,
  Pin,
  useAdvancedMarkerRef,
  useApiLoadingStatus,
  useMap,
} from '@vis.gl/react-google-maps';
import { Crosshair, ExternalLink, MapPin, Phone, Clock } from 'lucide-react';
import { useCallback, useEffect } from 'react';
import type {
  Establishment,
  EstablishmentCategoryItem,
} from '../types/petcare.ts';
import { formatPyg, getCategoryVisuals } from '../utils/format.ts';

const ASUNCION_CENTER = { lat: -25.2886, lng: -57.6054 };

interface EstablishmentMarkerProps {
  establishment: Establishment;
  colorHex?: string;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onCloseInfo: () => void;
  onViewDetails: (establishment: Establishment) => void;
}

function EstablishmentMarker({
  establishment,
  colorHex,
  isSelected,
  onSelect,
  onCloseInfo,
  onViewDetails,
}: EstablishmentMarkerProps) {
  const [markerRef, marker] = useAdvancedMarkerRef();
  const visuals = getCategoryVisuals(establishment.category, colorHex);

  const handleMarkerClick = useCallback(() => {
    onSelect(establishment.id);
  }, [establishment.id, onSelect]);

  return (
    <>
      <AdvancedMarker
        ref={markerRef}
        position={{ lat: establishment.latitude, lng: establishment.longitude }}
        onClick={handleMarkerClick}
        title={`${establishment.name} — ${establishment.category}`}
        zIndex={isSelected ? 50 : 10}
      >
        <Pin
          background={visuals.pinBg}
          borderColor={visuals.pinBorder}
          glyphColor={visuals.pinGlyph}
          scale={isSelected ? 1.25 : 1.0}
        />
      </AdvancedMarker>

      {isSelected && marker && (
        <InfoWindow
          anchor={marker}
          maxWidth={310}
          onCloseClick={onCloseInfo}
        >
          <div className="p-1 font-sans text-slate-800">
            <div className="text-xs font-medium text-slate-500">
              {establishment.category} · {establishment.pet_types.join(', ')}
            </div>
            <h3 className="mt-1 font-display text-sm font-bold text-slate-900">
              {establishment.name}
            </h3>
            <div className="mt-2 space-y-1 text-xs text-slate-600">
              <p className="flex items-start gap-1.5">
                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                <span>{establishment.address}</span>
              </p>
              <p className="flex items-start gap-1.5">
                <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                <span>{establishment.hours}</span>
              </p>
              <p className="flex items-start gap-1.5">
                <Phone className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                <span className="tabular-nums">{establishment.phone}</span>
              </p>
            </div>

            {establishment.services.length > 0 && (
              <div className="mt-2.5 border-t border-slate-100 pt-2">
                <div className="text-xs font-semibold text-slate-700">
                  Servicios destacados
                </div>
                <ul className="mt-1 space-y-1">
                  {establishment.services.slice(0, 2).map((svc) => (
                    <li
                      key={svc.id}
                      className="flex items-center justify-between gap-2 text-xs text-slate-600"
                    >
                      <span className="truncate">{svc.name}</span>
                      <span className="shrink-0 font-mono-tabular font-medium text-slate-900">
                        {formatPyg(svc.price_pyg)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-100 pt-2">
              <button
                type="button"
                onClick={() => onViewDetails(establishment)}
                className="inline-flex items-center gap-1 rounded-md bg-teal-700 px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-teal-800 whitespace-nowrap"
              >
                Ver ficha completa
                <ExternalLink className="h-3 w-3" />
              </button>
              <span className="font-mono-tabular text-[11px] text-slate-400">
                {establishment.latitude.toFixed(4)}, {establishment.longitude.toFixed(4)}
              </span>
            </div>
          </div>
        </InfoWindow>
      )}
    </>
  );
}

function MapViewportSync({
  establishments,
  selectedId,
}: {
  establishments: Establishment[];
  selectedId: string | null;
}) {
  const map = useMap('petcare-main-map');

  useEffect(() => {
    if (!map) return;
    if (selectedId) {
      const target = establishments.find((e) => e.id === selectedId);
      if (target) {
        map.panTo({ lat: target.latitude, lng: target.longitude });
        const currentZoom = map.getZoom() ?? 13;
        if (currentZoom < 14) {
          map.setZoom(15);
        }
        return;
      }
    }
  }, [map, selectedId, establishments]);

  return null;
}

interface PetMapProps {
  mapsApiKey: string;
  establishments: Establishment[];
  categories?: EstablishmentCategoryItem[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onViewDetails: (establishment: Establishment) => void;
}

export function PetMap({
  mapsApiKey,
  establishments,
  categories = [],
  selectedId,
  onSelect,
  onViewDetails,
}: PetMapProps) {
  const categoryColors: Record<string, string> = {};
  for (const cat of categories) {
    categoryColors[cat.name] = cat.color_hex;
  }
  const apiStatus = useApiLoadingStatus();
  const mainMap = useMap('petcare-main-map');

  const handleRecenter = useCallback(() => {
    if (!mainMap) return;
    if (establishments.length === 0) {
      mainMap.setCenter(ASUNCION_CENTER);
      mainMap.setZoom(13);
      return;
    }
    const g = (
      window as unknown as {
        google?: {
          maps?: {
            LatLngBounds: new () => {
              extend: (pt: { lat: number; lng: number }) => void;
            };
          };
        };
      }
    ).google;
    if (!g?.maps?.LatLngBounds) return;
    const bounds = new g.maps.LatLngBounds();
    establishments.forEach((est) => {
      bounds.extend({ lat: est.latitude, lng: est.longitude });
    });
    mainMap.fitBounds(
      bounds as unknown as Parameters<typeof mainMap.fitBounds>[0],
      56
    );
  }, [mainMap, establishments]);

  if (!mapsApiKey) {
    return (
      <div className="flex h-full min-h-[460px] flex-col items-center justify-center rounded-xl border border-slate-200 bg-white p-6 text-center">
        <MapPin className="h-8 w-8 text-slate-400" />
        <h3 className="mt-3 font-display text-base font-semibold text-slate-900">
          Mapa interactivo de Google Maps
        </h3>
        <p className="mt-1.5 max-w-md text-sm text-slate-600">
          Configurá la variable de entorno{' '}
          <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-800">
            VITE_GOOGLE_MAPS_API_KEY
          </code>{' '}
          para visualizar los marcadores georreferenciados en vivo.
        </p>
      </div>
    );
  }

  if (
    apiStatus === APILoadingStatus.FAILED ||
    apiStatus === APILoadingStatus.AUTH_FAILURE
  ) {
    return (
      <div className="flex h-full min-h-[460px] flex-col items-center justify-center rounded-xl border border-slate-200 bg-white p-6 text-center">
        <MapPin className="h-8 w-8 text-amber-600" />
        <h3 className="mt-3 font-display text-base font-semibold text-slate-900">
          No se pudo cargar Google Maps
        </h3>
        <p className="mt-1.5 max-w-md text-sm text-slate-600">
          Verificá la validez, restricciones HTTP referrer o cuota disponible de tu clave de Google Maps Platform.
        </p>
      </div>
    );
  }

  return (
    <div className="relative h-full min-h-[460px] w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
      <Map
        id="petcare-main-map"
        mapId="DEMO_MAP_ID"
        defaultCenter={ASUNCION_CENTER}
        defaultZoom={13}
        gestureHandling="greedy"
        disableDefaultUI={false}
        streetViewControl={false}
        mapTypeControl={false}
        internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
        style={{ width: '100%', height: '100%', minHeight: '460px' }}
        onClick={() => onSelect(null)}
      >
        <MapViewportSync establishments={establishments} selectedId={selectedId} />
        {establishments.map((est) => (
          <EstablishmentMarker
            key={est.id}
            establishment={est}
            colorHex={categoryColors[est.category]}
            isSelected={selectedId === est.id}
            onSelect={(id) => onSelect(id)}
            onCloseInfo={() => onSelect(null)}
            onViewDetails={onViewDetails}
          />
        ))}
      </Map>

      <div className="pointer-events-none absolute top-3 left-3 right-3 flex items-start justify-between gap-2">
        <div className="pointer-events-auto flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white/95 px-3 py-1.5 text-xs text-slate-700 shadow-sm backdrop-blur-sm">
          {(categories.length > 0
            ? categories
            : [
                { id: 'c1', name: 'Veterinaria', color_hex: '#0F766E' },
                { id: 'c2', name: 'Peluquería Canina', color_hex: '#B45309' },
                { id: 'c3', name: 'Tienda de Mascotas', color_hex: '#4338CA' },
              ]
          ).map((cat) => (
            <span key={cat.id} className="inline-flex items-center gap-1.5 whitespace-nowrap">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: cat.color_hex }}
                aria-hidden="true"
              />
              {cat.name}
            </span>
          ))}
        </div>

        <button
          type="button"
          onClick={handleRecenter}
          className="pointer-events-auto inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white/95 px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm backdrop-blur-sm transition-colors hover:bg-slate-50 whitespace-nowrap shrink-0"
        >
          <Crosshair className="h-3.5 w-3.5 text-teal-700" />
          Ver todos
        </button>
      </div>
    </div>
  );
}

interface CoordinatePickerMapProps {
  mapsApiKey: string;
  latitude: number;
  longitude: number;
  onChange: (lat: number, lng: number) => void;
}

export function CoordinatePickerMap({
  mapsApiKey,
  latitude,
  longitude,
  onChange,
}: CoordinatePickerMapProps) {
  if (!mapsApiKey) {
    return null;
  }

  const validLat = Number.isFinite(latitude) ? latitude : ASUNCION_CENTER.lat;
  const validLng = Number.isFinite(longitude) ? longitude : ASUNCION_CENTER.lng;

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200">
      <div className="bg-slate-50 px-3 py-1.5 text-xs text-slate-600 border-b border-slate-200">
        Hacé clic en el mapa para fijar automáticamente la latitud y longitud del establecimiento.
      </div>
      <div style={{ width: '100%', height: '210px' }}>
        <Map
          id="petcare-picker-map"
          mapId="DEMO_MAP_ID"
          defaultCenter={{ lat: validLat, lng: validLng }}
          center={{ lat: validLat, lng: validLng }}
          defaultZoom={14}
          gestureHandling="greedy"
          disableDefaultUI={true}
          zoomControl={true}
          internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
          style={{ width: '100%', height: '210px' }}
          onClick={(ev) => {
            const latLng = ev.detail?.latLng;
            if (latLng) {
              onChange(
                Number(latLng.lat.toFixed(6)),
                Number(latLng.lng.toFixed(6))
              );
            }
          }}
        >
          <AdvancedMarker position={{ lat: validLat, lng: validLng }}>
            <Pin background="#0F766E" borderColor="#115E59" glyphColor="#FFFFFF" />
          </AdvancedMarker>
        </Map>
      </div>
    </div>
  );
}

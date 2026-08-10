"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CircleMarker,
  GeoJSON,
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  Tooltip,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import plantsData from "@/data/plants.json";
import fpvData from "@/data/fpv_reservoirs.json";
import {
  PLANT_COLORS,
  PLANT_LABELS,
  plantRadius,
  type Plant,
  type PlantType,
} from "@/lib/plants";
import { fmtEstMw } from "@/lib/mapPlayback";
import type { GridNetwork, RooftopPoint } from "@/lib/api";
import { TransmissionNetworkLayer } from "@/app/components/TransmissionNetworkLayer";

const ALL_TYPES: PlantType[] = ["hydro", "coal", "oil", "wind", "solar"];
const SL_CENTER: [number, number] = [7.85, 80.7];
const SL_BOUNDS = L.latLngBounds([5.85, 79.5], [9.9, 82.0]);

type MapViewMode = "generation" | "network";

interface MapPanelProps {
  rooftopPoints?: RooftopPoint[];
  showRooftop?: boolean;
  onToggleRooftop?: (next: boolean) => void;
  rooftopLoading?: boolean;
  dispatchHighlight?: Record<string, number>;
  showFpv?: boolean;
  onToggleFpv?: (next: boolean) => void;
  fpvSeason?: string;
  /** Estimated MW commitment at selected hour — drives marker size. */
  plantOutputs?: Record<string, number>;
  /** 0–1 solar intensity for rooftop layer opacity. */
  solarIntensity?: number;
  /** National grid state mode — province coloring by net-load proxy. */
  nationalMode?: boolean;
  /** 0–1 operational stress for province fill intensity. */
  gridStress?: number;
  /** Transmission network snapshot from GET /grid/network. */
  gridNetwork?: GridNetwork | null;
  /** Map layer mode. */
  viewMode?: MapViewMode;
  onViewModeChange?: (mode: MapViewMode) => void;
}

function FitSriLanka() {
  const map = useMap();
  useEffect(() => {
    map.fitBounds(SL_BOUNDS, { padding: [24, 24] });
  }, [map]);
  return null;
}

const FPV_ICON = L.divIcon({
  className: "fpv-marker",
  html: `<span style="display:block;width:10px;height:10px;background:#3d6b7a;border:1px solid #f4f7fa;opacity:0.9"></span>`,
  iconSize: [10, 10],
  iconAnchor: [5, 5],
});

export function MapPanel({
  rooftopPoints = [],
  showRooftop = false,
  onToggleRooftop,
  rooftopLoading,
  dispatchHighlight,
  showFpv = false,
  onToggleFpv,
  fpvSeason = "Feb–Apr peak resource",
  plantOutputs,
  solarIntensity = 0.5,
  nationalMode = false,
  gridStress = 0.35,
  gridNetwork = null,
  viewMode: viewModeProp,
  onViewModeChange,
}: MapPanelProps) {
  const [internalViewMode, setInternalViewMode] = useState<MapViewMode>("network");
  const viewMode = viewModeProp ?? internalViewMode;
  const setViewMode = onViewModeChange ?? setInternalViewMode;
  const plants = plantsData as Plant[];
  const reservoirs = fpvData as {
    name: string;
    lat: number;
    lon: number;
    note: string;
  }[];
  const [activeTypes, setActiveTypes] = useState<Set<PlantType>>(
    () => new Set(ALL_TYPES)
  );
  const [provinces, setProvinces] = useState<GeoJSON.FeatureCollection | null>(
    null
  );
  const [hoveredProvince, setHoveredProvince] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/sri-lanka-provinces.geojson")
      .then((r) => r.json())
      .then((geo) => {
        if (!cancelled) setProvinces(geo);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const visiblePlants = useMemo(
    () => plants.filter((p) => activeTypes.has(p.type)),
    [plants, activeTypes]
  );

  const capacityByType = useMemo(() => {
    const acc: Record<PlantType, number> = {
      hydro: 0,
      coal: 0,
      oil: 0,
      wind: 0,
      solar: 0,
    };
    for (const p of plants) acc[p.type] += p.capacity_mw;
    return acc;
  }, [plants]);

  function toggleType(t: PlantType) {
    setActiveTypes((prev) => {
      const next = new Set(prev);
      if (next.has(t)) {
        if (next.size > 1) next.delete(t);
      } else {
        next.add(t);
      }
      return next;
    });
  }

  const provinceStyle = {
    fillColor: nationalMode
      ? `rgb(${Math.round(36 + gridStress * 80)}, ${Math.round(48 - gridStress * 20)}, ${Math.round(64 - gridStress * 30)})`
      : "#1a222d",
    fillOpacity: nationalMode ? 0.35 + gridStress * 0.45 : 0.35,
    color: nationalMode && gridStress > 0.6 ? "#e8a33d" : "#6eb6ff",
    weight: nationalMode && gridStress > 0.6 ? 1.5 : 1,
    opacity: 0.7,
  };

  return (
    <div className="relative scada-panel">
      <div className="flex flex-col gap-2 border-b border-[var(--line)] bg-[var(--panel-elevated)] px-3 py-2 sm:flex-row sm:items-center sm:justify-between sm:px-3">
        <div>
          <h2 className="font-display text-xs font-semibold uppercase tracking-wider text-[var(--foreground)]">
            {viewMode === "network"
              ? "Transmission network map"
              : nationalMode
                ? "National grid state map"
                : "National generation map"}
          </h2>
          <p className="font-mono-readout text-[0.65rem] text-[var(--ink-muted)]">
            {viewMode === "network"
              ? "CEB topology · modeled node balance · heuristic flow arrows"
              : hoveredProvince
                ? `${hoveredProvince} · net-load / solar proxy`
                : nationalMode
                  ? "Regions colored by operational stress · estimated commitments"
                  : "OpenStreetMap · plants · rooftop · FPV"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex border border-[var(--line)]">
            {(["network", "generation"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setViewMode(mode)}
                className={[
                  "font-display px-2.5 py-1.5 text-[0.65rem] font-semibold uppercase tracking-wide outline-none",
                  "focus-visible:ring-2 focus-visible:ring-[var(--solar)]",
                  viewMode === mode
                    ? "bg-[var(--mist)] text-[var(--foreground)]"
                    : "text-[var(--ink-muted)]",
                ].join(" ")}
              >
                {mode === "network" ? "Network" : "Generation"}
              </button>
            ))}
          </div>
          {onToggleFpv ? (
            <button
              type="button"
              onClick={() => onToggleFpv(!showFpv)}
              className={[
                "font-display border px-3 py-1.5 text-[0.7rem] font-semibold tracking-wide outline-none",
                "focus-visible:ring-2 focus-visible:ring-[var(--solar)] focus-visible:ring-offset-2",
                showFpv
                  ? "border-[var(--monsoon)] bg-[var(--mist)] text-[var(--demand)]"
                  : "border-[var(--line)] bg-[var(--mist)] text-[var(--demand)]",
              ].join(" ")}
            >
              {showFpv ? "Hide FPV reservoirs" : "Show FPV reservoirs"}
            </button>
          ) : null}
          {onToggleRooftop ? (
            <button
              type="button"
              onClick={() => onToggleRooftop(!showRooftop)}
              disabled={rooftopLoading}
              className={[
                "font-display border px-3 py-1.5 text-[0.7rem] font-semibold tracking-wide outline-none",
                "focus-visible:ring-2 focus-visible:ring-[var(--solar)] focus-visible:ring-offset-2",
                showRooftop
                  ? "border-[var(--solar)] bg-[var(--solar-wash)] text-[var(--demand)]"
                  : "border-[var(--line)] bg-[var(--mist)] text-[var(--demand)]",
              ].join(" ")}
            >
              {rooftopLoading
                ? "Loading rooftops…"
                : showRooftop
                  ? "Hide rooftop layer"
                  : "Show rooftop layer"}
            </button>
          ) : null}
        </div>
      </div>

      <div className="relative h-[min(70vh,640px)] w-full">
        <MapContainer
          center={SL_CENTER}
          zoom={7}
          minZoom={6}
          maxZoom={12}
          scrollWheelZoom
          className="h-full w-full bg-[var(--panel)]"
          style={{ background: "#0c1017" }}
        >
          <FitSriLanka />
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · &copy; <a href="https://carto.com/attributions">CARTO</a>'
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            subdomains="abcd"
            maxZoom={19}
          />

          {provinces ? (
            <GeoJSON
              data={provinces}
              style={() => provinceStyle}
              onEachFeature={(feature, layer) => {
                const name = String(
                  feature.properties?.shapeName ?? "Province"
                );
                layer.on({
                  mouseover: (e) => {
                    setHoveredProvince(name);
                    const target = e.target as L.Path;
                    target.setStyle({
                      fillColor: "#243040",
                      fillOpacity: 0.55,
                      color: "#e8a33d",
                      weight: 1.5,
                    });
                  },
                  mouseout: (e) => {
                    setHoveredProvince(null);
                    const target = e.target as L.Path;
                    target.setStyle(provinceStyle);
                  },
                });
              }}
            />
          ) : null}

          {viewMode === "network" ? (
            <TransmissionNetworkLayer network={gridNetwork} />
          ) : null}

          {showRooftop &&
            rooftopPoints.map((pt, i) => (
              <CircleMarker
                key={`rt-${i}`}
                center={[pt.lat, pt.lon]}
                radius={2}
                pathOptions={{
                  fillColor: "#E8A33D",
                  fillOpacity: 0.2 + solarIntensity * 0.45,
                  color: "#E8A33D",
                  weight: 0,
                  opacity: 0,
                }}
              />
            ))}

          {showFpv &&
            reservoirs.map((r) => (
              <Marker
                key={r.name}
                position={[r.lat, r.lon]}
                icon={FPV_ICON}
              >
                <Popup>
                  <div className="font-body text-xs">
                    <p className="font-semibold">{r.name}</p>
                    <p>Floating PV candidate (iPURSE 2025)</p>
                    <p>{fpvSeason}</p>
                    <p>{r.note}</p>
                  </div>
                </Popup>
              </Marker>
            ))}

          {viewMode === "generation" &&
            visiblePlants.map((plant) => {
            const commitmentMw =
              plantOutputs?.[plant.name] ?? plant.capacity_mw * 0.55;
            const r = plantRadius(Math.max(commitmentMw, plant.capacity_mw * 0.08));
            const color = PLANT_COLORS[plant.type];
            const hl = dispatchHighlight?.[plant.name] ?? 0;
            const util =
              plant.capacity_mw > 0 ? commitmentMw / plant.capacity_mw : 0;
            const confidence = Math.min(0.95, 0.55 + hl * 0.35);

            return (
              <CircleMarker
                key={plant.name}
                center={[plant.lat, plant.lon]}
                radius={r + hl * 3}
                pathOptions={{
                  fillColor: color,
                  fillOpacity: 0.45 + util * 0.4,
                  color: hl > 0 ? "#f4f7fa" : "#c5d0de",
                  weight: hl > 0 ? 2.5 : 1.2,
                }}
              >
                <Tooltip direction="top" offset={[0, -4]} opacity={0.95}>
                  <div className="text-xs">
                    <p className="font-semibold">{plant.name}</p>
                    <p>
                      {PLANT_LABELS[plant.type]} · est. commitment{" "}
                      {fmtEstMw(commitmentMw)} MW
                    </p>
                    <p>
                      est. utilization {(util * 100).toFixed(0)}% · conf{" "}
                      {(confidence * 100).toFixed(0)}%
                    </p>
                    <p className="text-[0.65rem] opacity-80">{plant.note}</p>
                  </div>
                </Tooltip>
              </CircleMarker>
            );
          })}
        </MapContainer>
      </div>

      <div className="grid gap-3 border-t border-[var(--line)] px-3 py-3 sm:grid-cols-[1fr_auto] sm:px-4">
        <div className="flex flex-wrap gap-2">
          {viewMode === "network" ? (
            <>
              <span className="inline-flex items-center gap-1.5 border border-[var(--solar)]/40 bg-[var(--solar-wash)] px-2 py-1 text-[0.65rem] font-medium text-[var(--demand)]">
                <span className="h-2.5 w-2.5 rounded-full bg-[var(--solar)]" aria-hidden />
                Net exporter (modeled)
              </span>
              <span className="inline-flex items-center gap-1.5 border border-indigo-400/30 bg-indigo-950/40 px-2 py-1 text-[0.65rem] font-medium text-[var(--demand)]">
                <span className="h-2.5 w-2.5 rounded-full bg-indigo-400" aria-hidden />
                Net importer (modeled)
              </span>
              {gridNetwork?.as_of ? (
                <span className="font-mono-readout text-[0.65rem] text-[var(--ink-muted)]">
                  As of {gridNetwork.as_of.slice(11, 16)} · {gridNetwork.edges.length} verified line(s)
                </span>
              ) : null}
            </>
          ) : (
            ALL_TYPES.map((t) => {
            const on = activeTypes.has(t);
            return (
              <button
                key={t}
                type="button"
                onClick={() => toggleType(t)}
                className={[
                  "inline-flex items-center gap-1.5 border px-2 py-1 text-[0.65rem] font-medium outline-none",
                  "focus-visible:ring-2 focus-visible:ring-[var(--solar)]",
                  on
                    ? "border-[var(--demand)]/30 bg-[var(--mist)] text-[var(--demand)]"
                    : "border-[var(--line)] text-[var(--ink-muted)] opacity-50",
                ].join(" ")}
              >
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ background: PLANT_COLORS[t] }}
                  aria-hidden
                />
                {PLANT_LABELS[t]}
                <span className="text-[var(--ink-muted)]">
                  {capacityByType[t].toFixed(0)} MW
                </span>
              </button>
            );
          })
          )}
          {showRooftop ? (
            <span className="inline-flex items-center gap-1.5 border border-[var(--solar)]/35 bg-[var(--solar-wash)] px-2 py-1 text-[0.65rem] font-medium text-[var(--demand)]">
              <span
                className="h-2 w-2 rounded-full bg-[var(--solar)] opacity-50"
                aria-hidden
              />
              Rooftop sample · ~1,935 MW Digest total · illustrative
            </span>
          ) : null}
          {showFpv ? (
            <span className="inline-flex items-center gap-1.5 border border-[var(--monsoon)]/40 bg-[var(--mist)] px-2 py-1 text-[0.65rem] font-medium text-[var(--demand)]">
              <span className="h-2.5 w-2.5 bg-[var(--monsoon)]" aria-hidden />
              FPV reservoirs · potential not built · {fpvSeason}
            </span>
          ) : null}
        </div>
        <p className="font-body max-w-prose text-[0.65rem] leading-relaxed text-[var(--ink-muted)] sm:text-right">
          {viewMode === "network" && gridNetwork?.map_caption
            ? gridNetwork.map_caption
            : "Estimated commitments from merit-order model — not SCADA MW/nameplate pairs. Marker intensity = utilization; tooltip shows confidence band."}
        </p>
      </div>
    </div>
  );
}

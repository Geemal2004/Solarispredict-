"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { CircleMarker, Polyline, Tooltip } from "react-leaflet";
import type { GridNetwork } from "@/lib/api";
import { fmtEstMw } from "@/lib/mapPlayback";

const EXPORT_COLOR = "#E8A33D";
const IMPORT_COLOR = "#6366f1";
const LINE_BASE = "#6eb6ff";

function nodeRadius(netMw: number): number {
  return Math.min(22, 6 + Math.sqrt(Math.abs(netMw)) * 1.1);
}

function lineWeight(mw: number): number {
  return Math.min(6, 1.2 + mw / 120);
}

function nodeByName(network: GridNetwork): Map<string, GridNetwork["nodes"][0]> {
  return new Map(network.nodes.map((n) => [n.name, n]));
}

function FlowDot({
  from,
  to,
  color,
}: {
  from: [number, number];
  to: [number, number];
  color: string;
}) {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      setPhase((p) => (p + 0.035) % 1);
    }, 120);
    return () => window.clearInterval(id);
  }, []);

  const lat = from[0] + (to[0] - from[0]) * phase;
  const lon = from[1] + (to[1] - from[1]) * phase;

  return (
    <CircleMarker
      center={[lat, lon]}
      radius={4}
      pathOptions={{
        fillColor: color,
        fillOpacity: 0.95,
        color: "#f4f7fa",
        weight: 1,
      }}
    />
  );
}

export function TransmissionNetworkLayer({
  network,
}: {
  network: GridNetwork | null;
}) {
  const lookup = useMemo(
    () => (network ? nodeByName(network) : new Map()),
    [network]
  );

  if (!network) return null;

  return (
    <>
      {network.edges.map((edge) => {
        const a = lookup.get(edge.from);
        const b = lookup.get(edge.to);
        if (!a || !b) return null;

        const flow = edge.flow_direction;
        const mag = edge.flow_magnitude_estimate ?? 0;
        const positions: [number, number][] = [
          [a.lat, a.lon],
          [b.lat, b.lon],
        ];

        return (
          <Fragment key={`${edge.from}-${edge.to}`}>
            <Polyline
              positions={positions}
              pathOptions={{
                color: flow ? EXPORT_COLOR : LINE_BASE,
                weight: lineWeight(mag),
                opacity: flow ? 0.35 + Math.min(0.5, mag / 500) : 0.25,
                dashArray: flow ? undefined : "6 8",
              }}
            />
            {flow ? (
              <FlowDot
                from={
                  flow.from === edge.from
                    ? [a.lat, a.lon]
                    : [b.lat, b.lon]
                }
                to={
                  flow.to === edge.to ? [b.lat, b.lon] : [a.lat, a.lon]
                }
                color={EXPORT_COLOR}
              />
            ) : null}
          </Fragment>
        );
      })}

      {network.nodes.map((node) => {
        const net = node.net_injection_mw;
        const exporting = net > 0.5;
        const importing = net < -0.5;
        const color = exporting ? EXPORT_COLOR : importing ? IMPORT_COLOR : "#8a96a8";
        const pulseClass = Math.abs(net) > 20 ? "substation-pulse" : "";

        return (
          <CircleMarker
            key={node.name}
            center={[node.lat, node.lon]}
            radius={nodeRadius(net)}
            pathOptions={{
              fillColor: color,
              fillOpacity: 0.55,
              color: "#f4f7fa",
              weight: 1.5,
              className: pulseClass,
            }}
          >
            <Tooltip direction="top" offset={[0, -4]} opacity={0.95}>
              <div className="text-xs font-body">
                <p className="font-semibold">
                  {node.name} · {node.voltage_kv} kV
                </p>
                <p className="text-[0.65rem] opacity-80">{node.type.replace("_", " ")}</p>
                <p>Gen {fmtEstMw(node.generation_mw)} · load {fmtEstMw(node.demand_mw)}</p>
                <p>
                  Net {net > 0 ? "+" : ""}
                  {Math.round(net)} MW ·{" "}
                  {exporting ? "net exporter" : importing ? "net importer" : "balanced"}
                </p>
                <p className="text-[0.65rem] opacity-70">Modeled — not SCADA</p>
              </div>
            </Tooltip>
          </CircleMarker>
        );
      })}
    </>
  );
}

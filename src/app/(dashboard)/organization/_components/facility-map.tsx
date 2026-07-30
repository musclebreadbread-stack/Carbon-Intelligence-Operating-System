"use client";

/**
 * Facility map.
 *
 * `mapbox-gl` needs an access token to fetch tiles, and no token exists in this
 * environment. Rather than rendering a broken canvas or a 401 loop, the component
 * is **gated on the token** and falls back to a coordinate list that shows exactly
 * the same information the map would carry. The token is read on the server and
 * passed in, because `MAPBOX_ACCESS_TOKEN` is not a `NEXT_PUBLIC_` variable.
 */

import * as React from "react";
import { MapPin } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { formatNumber } from "@/lib/format";

export type MappedFacility = {
  readonly id: string;
  readonly name: string;
  readonly city: string | null;
  readonly country: string | null;
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly operationalControl: boolean;
  readonly equityShare: number | null;
  /** Calculated emissions attributable to the facility, for the marker size. */
  readonly emissions: number;
};

export type FacilityMapProps = {
  readonly facilities: readonly MappedFacility[];
  /** `MAPBOX_ACCESS_TOKEN`; the interactive map only renders when it is present. */
  readonly accessToken: string | null;
  readonly unit?: string;
};

function FacilityList({
  facilities,
  unit,
}: {
  readonly facilities: readonly MappedFacility[];
  readonly unit: string;
}) {
  return (
    <ul className="divide-y rounded-lg border" data-testid="facility-coordinate-list">
      {facilities.map((facility) => (
        <li key={facility.id} className="flex flex-wrap items-center gap-2 p-2.5 text-sm">
          <MapPin className="size-4 shrink-0 text-emerald-600" />
          <span className="font-medium">{facility.name}</span>
          <span className="text-muted-foreground">
            {[facility.city, facility.country].filter(Boolean).join(", ") || "location not set"}
          </span>
          {facility.latitude !== null && facility.longitude !== null ? (
            <span className="font-mono text-[11px] text-muted-foreground">
              {facility.latitude.toFixed(4)}, {facility.longitude.toFixed(4)}
            </span>
          ) : (
            <Badge variant="outline">no coordinates</Badge>
          )}
          <Badge variant={facility.operationalControl ? "secondary" : "outline"}>
            {facility.operationalControl ? "operational control" : "no operational control"}
          </Badge>
          {facility.equityShare !== null && facility.equityShare !== 100 && (
            <Badge variant="outline">{facility.equityShare}% equity</Badge>
          )}
          <span className="ml-auto font-mono text-xs">
            {formatNumber(facility.emissions, 0)} {unit}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function FacilityMap({ facilities, accessToken, unit = "tCO2e" }: FacilityMapProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [mapError, setMapError] = React.useState<string | null>(null);
  const locatable = facilities.filter(
    (facility) => facility.latitude !== null && facility.longitude !== null,
  );

  React.useEffect(() => {
    if (!accessToken || locatable.length === 0) return;
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;
    let cleanup: (() => void) | undefined;

    // Imported dynamically so `mapbox-gl` (and its CSS) never enters the bundle of
    // a deployment that has no token.
    void (async () => {
      try {
        const mapboxgl = (await import("mapbox-gl")).default;
        await import("mapbox-gl/dist/mapbox-gl.css");
        if (cancelled) return;

        mapboxgl.accessToken = accessToken;
        const map = new mapboxgl.Map({
          container,
          style: "mapbox://styles/mapbox/light-v11",
          center: [locatable[0].longitude as number, locatable[0].latitude as number],
          zoom: 2,
        });
        map.addControl(new mapboxgl.NavigationControl(), "top-right");

        const bounds = new mapboxgl.LngLatBounds();
        for (const facility of locatable) {
          const coordinates: [number, number] = [
            facility.longitude as number,
            facility.latitude as number,
          ];
          bounds.extend(coordinates);
          new mapboxgl.Marker({ color: facility.operationalControl ? "#059669" : "#f59e0b" })
            .setLngLat(coordinates)
            .setPopup(
              new mapboxgl.Popup({ offset: 16 }).setText(
                `${facility.name} — ${formatNumber(facility.emissions, 0)} ${unit}`,
              ),
            )
            .addTo(map);
        }
        if (locatable.length > 1) map.fitBounds(bounds, { padding: 48, maxZoom: 6 });

        cleanup = () => map.remove();
      } catch (error) {
        setMapError(error instanceof Error ? error.message : "Map failed to load");
      }
    })();

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [accessToken, locatable, unit]);

  if (facilities.length === 0) {
    return (
      <EmptyState
        title="No facilities"
        description="Create a facility to see it on the map."
        icon={MapPin}
      />
    );
  }

  if (!accessToken) {
    return (
      <div className="space-y-2" data-testid="facility-map-placeholder">
        <div className="rounded-lg border border-dashed bg-muted/40 p-3 text-xs text-muted-foreground">
          <p className="font-medium text-foreground">Interactive map disabled</p>
          <p>
            <code>MAPBOX_ACCESS_TOKEN</code> is not set, so no tiles can be fetched. The
            facilities and their coordinates are listed below instead; set the token and this
            panel becomes a Mapbox GL map with one marker per facility.
          </p>
        </div>
        <FacilityList facilities={facilities} unit={unit} />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div
        ref={containerRef}
        className="h-80 w-full overflow-hidden rounded-lg border"
        data-testid="facility-map"
      />
      {mapError && (
        <p className="text-xs text-destructive">
          Map could not be initialised: {mapError}. The coordinate list below is unaffected.
        </p>
      )}
      <FacilityList facilities={facilities} unit={unit} />
    </div>
  );
}

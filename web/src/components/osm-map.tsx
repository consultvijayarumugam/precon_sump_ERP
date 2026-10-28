"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";

export interface MapPin {
  id: string;
  latitude: number;
  longitude: number;
  /** Shown in the popup; plain text. */
  title: string;
  subtitle?: string;
  /** Pin colour (any CSS colour). */
  color?: string;
}

/**
 * Pins on a free OpenStreetMap map (Leaflet). No Google Maps, no API key, no
 * bills. Pins are drawn as circles, so no marker images are needed. Leaflet is
 * loaded in the browser only.
 */
export function OsmMap({ pins, height = 320, emptyText = "No locations yet." }: { pins: MapPin[]; height?: number; emptyText?: string }) {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!container.current || pins.length === 0) return;
    let disposed = false;
    let map: import("leaflet").Map | undefined;
    void import("leaflet").then((L) => {
      if (disposed || !container.current) return;
      map = L.map(container.current, { scrollWheelZoom: false });
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map);
      const bounds = L.latLngBounds([]);
      for (const pin of pins) {
        const at = L.latLng(pin.latitude, pin.longitude);
        bounds.extend(at);
        const popup = document.createElement("div");
        const title = document.createElement("strong");
        title.textContent = pin.title;
        popup.appendChild(title);
        if (pin.subtitle) {
          const sub = document.createElement("div");
          sub.textContent = pin.subtitle;
          popup.appendChild(sub);
        }
        L.circleMarker(at, { radius: 8, color: "#ffffff", weight: 2, fillColor: pin.color ?? "#2557eb", fillOpacity: 0.95 })
          .bindPopup(popup)
          .addTo(map);
      }
      if (pins.length === 1) map.setView(bounds.getCenter(), 14);
      else map.fitBounds(bounds, { padding: [30, 30], maxZoom: 14 });
    });
    return () => {
      disposed = true;
      map?.remove();
    };
  }, [pins]);

  if (pins.length === 0) {
    return (
      <div
        className="grid place-items-center rounded-xl border border-dashed border-neutral-300 text-sm text-neutral-500 dark:border-neutral-700"
        style={{ height }}
      >
        {emptyText}
      </div>
    );
  }
  return <div ref={container} className="z-0 overflow-hidden rounded-xl border border-neutral-200 dark:border-neutral-800" style={{ height }} />;
}

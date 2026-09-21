"use client";

import { useState } from "react";
import Image from "next/image";
import { TILE_PROVIDERS } from "@/constants/tile-providers";

interface MapTileSwitcherProps {
  selectedProviderId: string;
  onProviderChange: (providerId: string) => void;
  bottomOffset?: number;
}

/**
 * MapTileSwitcher — Nocturne glass tile layer selector.
 */
export function MapTileSwitcher({
  selectedProviderId,
  onProviderChange,
  bottomOffset = 128,
}: MapTileSwitcherProps) {
  const [isHovered, setIsHovered] = useState(false);

  // Map tile providers to display options with PNG previews
  const layerOptions = [
    {
      id: "nocturne",
      label: "Nocturne",
      image: "/map-dark.png",
      provider: TILE_PROVIDERS.find((p) => p.id === "nocturne"),
    },
    {
      id: "osm",
      label: "Basic",
      image: "/map-basic.png",
      provider: TILE_PROVIDERS.find((p) => p.id === "osm"),
    },
    {
      id: "satellite",
      label: "Satellite",
      image: "/map-satellite.png",
      provider: TILE_PROVIDERS.find((p) => p.id === "satellite"),
    },
  ];

  const selectedLayer =
    layerOptions.find((layer) => layer.id === selectedProviderId) ||
    layerOptions[0];

  return (
    <div
      className="absolute left-6 flex flex-col sm:flex-row items-start sm:items-center gap-2 z-[1000] transition-all duration-300"
      style={{ bottom: `max(${bottomOffset}px, calc(env(safe-area-inset-bottom) + 5.5rem))` }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Slide-out Panel */}
      <div
        className={`order-first sm:order-last flex items-center gap-2 transition-all duration-300 ease-out ${
          isHovered
            ? "opacity-100 translate-y-0 sm:translate-y-0 sm:translate-x-0"
            : "opacity-0 translate-y-4 sm:translate-y-0 sm:-translate-x-4 pointer-events-none"
        }`}
      >
        <div className="flex items-center gap-2 glass-panel rounded-2xl shadow-xl p-1 ghost-border">
          {layerOptions.map((layer) => (
            <button
              key={layer.id}
              onClick={() => layer.provider && onProviderChange(layer.id)}
              disabled={!layer.provider}
              className={`flex flex-col items-center gap-1.5 px-2 sm:px-3 py-2 rounded-xl transition-all ${
                selectedProviderId === layer.id
                  ? "bg-[#E6EAF0]/20 ring-2 ring-[#E6EAF0]"
                  : "hover:bg-[#0C1416]"
              } ${!layer.provider ? "opacity-50 cursor-not-allowed" : ""}`}
              title={layer.label}
            >
              <div className="relative h-10 w-10 sm:h-12 sm:w-12 rounded-lg overflow-hidden shadow-sm">
                <Image
                  src={layer.image}
                  alt={`${layer.label} map preview`}
                  fill
                  sizes="(max-width: 640px) 40px, 48px"
                  className="object-cover nv-map-thumb"
                />
              </div>
              <span className="kicker text-[9px] tracking-[0.12em]">
                {layer.label}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Main Tile Button */}
      <div className="flex flex-col items-center gap-1">
        <button
          className="overflow-hidden rounded-2xl glass-panel shadow-lg hover:shadow-xl transition-all ghost-border"
          aria-label="Tile layer options"
        >
          <div className="relative h-16 w-16 sm:h-18 sm:w-20">
            <Image
              src={selectedLayer.image}
              alt={`${selectedLayer.label} map preview`}
              fill
              sizes="(max-width: 640px) 64px, 80px"
              className="object-cover nv-map-thumb"
            />
          </div>
          <span className="block glass-panel px-2 py-1.5 kicker text-[9px] tracking-[0.12em]">
            {selectedLayer.label}
          </span>
        </button>
      </div>
    </div>
  );
}

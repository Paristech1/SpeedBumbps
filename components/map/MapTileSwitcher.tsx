"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { TILE_PROVIDERS } from "@/constants/tile-providers";

interface MapTileSwitcherProps {
  selectedProviderId: string;
  onProviderChange: (providerId: string) => void;
}

const LAYER_OPTIONS = [
  { id: "nocturne", label: "Nocturne", image: "/map-dark.png" },
  { id: "osm", label: "Basic", image: "/map-basic.png" },
  { id: "satellite", label: "Satellite", image: "/map-satellite.png" },
].map((o) => ({ ...o, provider: TILE_PROVIDERS.find((p) => p.id === o.id) }));

/**
 * Base-map picker — one button in the map controls rail. Tapping it opens the
 * three layers to its left; tapping a layer, the button again, or anywhere
 * else closes them. Tap rather than hover, because a phone has no hover.
 */
export function MapTileSwitcher({ selectedProviderId, onProviderChange }: MapTileSwitcherProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`w-11 h-11 flex items-center justify-center transition-colors ${
          open ? "text-[#E6EAF0] bg-[var(--nv-wash-strong)]" : "text-[#B6BECB] hover:text-[#E6EAF0]"
        }`}
        aria-label="Map layers"
        aria-expanded={open}
        title="Map layers"
      >
        <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round">
          <path d="M12 3 2.5 8 12 13l9.5-5L12 3Z" />
          <path d="m2.5 12.5 9.5 5 9.5-5" />
          <path d="m2.5 16.5 9.5 5 9.5-5" opacity=".55" />
        </svg>
      </button>

      <div
        className={`absolute right-[calc(100%+0.75rem)] top-1/2 -translate-y-1/2 flex gap-1 p-1.5 rounded-2xl nv-glass transition-all duration-200 ease-out ${
          open ? "opacity-100 translate-x-0 pointer-events-auto" : "opacity-0 translate-x-2 pointer-events-none"
        }`}
        role="menu"
      >
        {LAYER_OPTIONS.map((layer) => {
          const selected = selectedProviderId === layer.id;
          return (
            <button
              key={layer.id}
              role="menuitemradio"
              aria-checked={selected}
              onClick={() => {
                if (layer.provider) onProviderChange(layer.id);
                setOpen(false);
              }}
              disabled={!layer.provider}
              tabIndex={open ? 0 : -1}
              className="flex flex-col items-center gap-1.5 px-1.5 pt-1.5 pb-1 rounded-xl transition-colors hover:bg-[var(--nv-wash)] disabled:opacity-40"
            >
              <span
                className={`relative block h-11 w-11 rounded-lg overflow-hidden ring-1 ${
                  selected ? "ring-2 ring-[#2BD9CE]" : "ring-[#E6EAF0]/25"
                }`}
              >
                <Image
                  src={layer.image}
                  alt=""
                  fill
                  sizes="44px"
                  className="object-cover nv-map-thumb"
                />
              </span>
              <span className={`kicker text-[9px] tracking-[0.14em] ${selected ? "text-[#E6EAF0]" : ""}`}>
                {layer.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

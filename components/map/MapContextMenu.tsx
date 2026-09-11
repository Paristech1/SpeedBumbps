"use client";

import { memo, useCallback, useEffect, useRef, useState, useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Copy, MapPin, Ruler, Check, Star, Navigation } from "lucide-react";
import { toast } from "sonner";
import { formatDecimalDegrees } from "@/lib/utils/coordinates";
import { fadeScaleVariants } from "@/lib/motion";
import type { ContextMenuPosition } from "@/hooks/useMapContextMenu";

interface MapContextMenuProps {
  isOpen: boolean;
  position: ContextMenuPosition | null;
  onClose: () => void;
  onAddMarker: (lat: number, lng: number) => void;
  onStartMeasurement: () => void;
  onAddPOI?: (lat: number, lng: number) => void;
  /** Plan a route to this point. */
  onRouteHere?: (lat: number, lng: number) => void;
}

interface MenuItemProps {
  icon: React.ReactNode;
  label: string;
  sublabel?: string;
  onClick: () => void;
  showCopied?: boolean;
}

/**
 * Individual menu item component
 */
const MenuItem = memo(function MenuItem({
  icon,
  label,
  sublabel,
  onClick,
  showCopied,
}: MenuItemProps) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 w-full px-2.5 py-1.5 text-left hover:bg-sb-surface-container-high transition-colors rounded-lg group"
    >
      <span className="flex-shrink-0 text-sb-on-surface-variant group-hover:text-sb-primary">
        {showCopied ? <Check className="h-4 w-4 text-sb-tertiary" /> : icon}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-sb-on-surface">
          {showCopied ? "Copied!" : label}
        </div>
        {sublabel && !showCopied && (
          <div className="text-xs text-sb-outline truncate">
            {sublabel}
          </div>
        )}
      </div>
    </button>
  );
});

MenuItem.displayName = "MenuItem";

// Menu dimensions for position calculation (approximate)
const MENU_WIDTH = 220;
const MENU_HEIGHT = 240;
const MENU_PADDING = 8;

/**
 * MapContextMenu - Right-click context menu for map interactions
 *
 * Features:
 * - Copy coordinates to clipboard
 * - Add marker at clicked location
 * - Start measurement from clicked location
 * - Keyboard accessible (Escape to close)
 * - Auto-positions to stay within viewport
 * - Memoized for performance
 */
export const MapContextMenu = memo(function MapContextMenu({
  isOpen,
  position,
  onClose,
  onAddMarker,
  onStartMeasurement,
  onAddPOI,
  onRouteHere,
}: MapContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  // Track which position was copied (null means not copied)
  const [copiedPosition, setCopiedPosition] = useState<string | null>(null);

  // Format coordinates for display
  const coordsText = useMemo(() => {
    if (!position) return "";
    return formatDecimalDegrees([position.latlng.lat, position.latlng.lng], 6);
  }, [position]);

  // Derive copied state from position comparison
  const positionKey = position ? `${position.x}-${position.y}` : null;
  const copied = copiedPosition === positionKey;

  // Calculate adjusted position using useMemo instead of useEffect + setState
  const displayPosition = useMemo(() => {
    if (!position) return { x: 0, y: 0 };

    let x = position.x;
    let y = position.y;

    // Use window dimensions as fallback for container bounds
    // The actual adjustment will happen via CSS if needed
    if (typeof window !== "undefined") {
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      // Adjust horizontal position if menu would overflow right edge
      if (x + MENU_WIDTH > viewportWidth) {
        x = Math.max(0, x - MENU_WIDTH - MENU_PADDING);
      }

      // Adjust vertical position if menu would overflow bottom edge
      if (y + MENU_HEIGHT > viewportHeight) {
        y = Math.max(0, y - MENU_HEIGHT - MENU_PADDING);
      }
    }

    return { x, y };
  }, [position]);

  /**
   * Copy coordinates to clipboard
   */
  const handleCopyCoordinates = useCallback(async () => {
    if (!position || !positionKey) return;

    try {
      await navigator.clipboard.writeText(coordsText);
      setCopiedPosition(positionKey);
      toast.success("Coordinates copied to clipboard");
      setTimeout(() => {
        setCopiedPosition(null);
        onClose();
      }, 1000);
    } catch {
      // Fallback: create a temporary input element
      try {
        const input = document.createElement("input");
        input.value = coordsText;
        input.style.position = "fixed";
        input.style.opacity = "0";
        document.body.appendChild(input);
        input.select();
        input.setSelectionRange(0, 99999);
        document.execCommand("copy");
        document.body.removeChild(input);
        setCopiedPosition(positionKey);
        toast.success("Coordinates copied to clipboard");
        setTimeout(() => {
          setCopiedPosition(null);
          onClose();
        }, 1000);
      } catch {
        toast.error("Failed to copy coordinates");
      }
    }
  }, [position, positionKey, coordsText, onClose]);

  /**
   * Handle add marker
   */
  const handleAddMarker = useCallback(() => {
    if (!position) return;
    onAddMarker(position.latlng.lat, position.latlng.lng);
    onClose();
  }, [position, onAddMarker, onClose]);

  /**
   * Handle start measurement
   */
  const handleStartMeasurement = useCallback(() => {
    onStartMeasurement();
    onClose();
  }, [onStartMeasurement, onClose]);

  /**
   * Handle add to POI
   */
  const handleAddPOI = useCallback(() => {
    if (!position || !onAddPOI) return;
    onAddPOI(position.latlng.lat, position.latlng.lng);
    onClose();
  }, [position, onAddPOI, onClose]);

  const handleRouteHere = useCallback(() => {
    if (!position || !onRouteHere) return;
    onRouteHere(position.latlng.lat, position.latlng.lng);
    onClose();
  }, [position, onRouteHere, onClose]);

  /**
   * Handle click outside to close
   */
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    // Delay to prevent immediate close from the contextmenu event
    const timeoutId = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
    }, 0);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && position && (
        <motion.div
          key="context-menu"
          ref={menuRef}
          variants={fadeScaleVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          className="absolute z-[1200] min-w-[210px] bg-sb-surface-container-high/95 backdrop-blur-md rounded-2xl shadow-2xl border border-sb-outline-variant/30 py-2 px-2"
          style={{
            left: displayPosition.x,
            top: displayPosition.y,
          }}
          role="menu"
          aria-label="Map context menu"
        >
          {/* Route here — the primary action */}
          {onRouteHere && (
            <>
              <MenuItem
                icon={<Navigation className="h-4 w-4 text-sb-secondary" />}
                label="Route here"
                sublabel="Plan a bump-aware route to this spot"
                onClick={handleRouteHere}
              />
              <div className="my-1.5 border-t border-sb-outline-variant/20" />
            </>
          )}

          {/* Coordinates */}
          <MenuItem
            icon={<Copy className="h-4 w-4" />}
            label="Copy Coordinates"
            sublabel={coordsText}
            onClick={handleCopyCoordinates}
            showCopied={copied}
          />

          {/* Divider */}
          <div className="my-1.5 border-t border-sb-outline-variant/20" />

          {/* Add Marker */}
          <MenuItem
            icon={<MapPin className="h-4 w-4" />}
            label="Add Marker"
            sublabel="Place a marker here"
            onClick={handleAddMarker}
          />

          {/* Measurement */}
          <MenuItem
            icon={<Ruler className="h-4 w-4" />}
            label="Measure"
            sublabel="Start distance measurement"
            onClick={handleStartMeasurement}
          />

          {/* Add to My Places (if handler provided) */}
          {onAddPOI && (
            <>
              {/* Divider */}
              <div className="my-1.5 border-t border-sb-outline-variant/20" />

              <MenuItem
                icon={<Star className="h-4 w-4 text-sb-warning-orange" />}
                label="Add to My Places"
                sublabel="Save this location"
                onClick={handleAddPOI}
              />
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
});

MapContextMenu.displayName = "MapContextMenu";

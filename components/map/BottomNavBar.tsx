"use client";

import { motion } from "framer-motion";
import { MapPin } from "lucide-react";
import type { TabId } from "@/types/user-data";

interface BottomNavBarProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  onFabClick: () => void;
}

interface NavItemProps {
  active: boolean;
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
}

function NavItem({ active, label, icon, onClick }: NavItemProps) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="relative flex flex-col items-center justify-center px-4 py-2 text-sb-outline hover:text-sb-primary active:scale-95 transition-colors"
    >
      {active && (
        <motion.div
          layoutId="bottom-nav-active-pill"
          className="absolute inset-0 bg-sb-primary/15 border border-sb-primary/30 rounded-[20px]"
          transition={{ type: "spring", stiffness: 400, damping: 35 }}
        />
      )}
      <div className={`relative z-10 transition-colors ${active ? "text-sb-primary" : "text-sb-outline"}`}>
        {icon}
      </div>
      <span className={`relative z-10 font-[var(--font-body)] text-[10px] font-semibold uppercase tracking-widest mt-0.5 transition-colors ${
        active ? "text-sb-primary" : "text-sb-outline"
      }`}>
        {label}
      </span>
    </button>
  );
}

/**
 * Bottom navigation — Velocity Dark shared component.
 * Sits above tab drawers (z-1060) so tabs stay tappable while one is open.
 * Includes layoutId sliding pill for active tab and safe-area padding.
 */
export function BottomNavBar({ activeTab, onTabChange, onFabClick }: BottomNavBarProps) {
  // Re-tapping the active tab returns to the map
  const handleTab = (tab: TabId) => onTabChange(activeTab === tab ? "explore" : tab);

  return (
    <nav className="fixed bottom-0 left-0 w-full z-[1060] flex justify-around items-center px-4 pt-3 pb-[max(1.75rem,env(safe-area-inset-bottom))] bg-sb-surface/85 backdrop-blur-xl rounded-t-[28px] border-t border-sb-outline-variant/30 shadow-[0_-8px_30px_rgb(0,0,0,0.5)]">
      <NavItem
        active={activeTab === "explore"}
        label="Explore"
        onClick={() => onTabChange("explore")}
        icon={
          <svg className="w-5 h-5 mb-0.5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M20.5 3l-.16.03L15 5.1 9 3 3.36 4.9c-.21.07-.36.25-.36.48V20.5c0 .28.22.5.5.5l.16-.03L9 18.9l6 2.1 5.64-1.9c.21-.07.36-.25.36-.48V3.5c0-.28-.22-.5-.5-.5zM15 19l-6-2.11V5l6 2.11V19z" />
          </svg>
        }
      />

      <NavItem
        active={activeTab === "saved"}
        label="Saved"
        onClick={() => handleTab("saved")}
        icon={
          <svg className="w-5 h-5 mb-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
          </svg>
        }
      />

      {/* SpeedBumps Signature FAB */}
      <div className="relative -top-6">
        <button
          onClick={onFabClick}
          className="w-14 h-14 rounded-full bg-gradient-to-br from-sb-primary to-sb-primary-container flex items-center justify-center text-sb-on-primary-container shadow-[0_0_24px_rgba(33,150,243,0.45)] border-4 border-sb-surface active:scale-90 transition-transform"
          aria-label="Plan route"
        >
          <MapPin className="w-6 h-6" />
        </button>
      </div>

      <NavItem
        active={activeTab === "reports"}
        label="Reports"
        onClick={() => handleTab("reports")}
        icon={
          <svg className="w-5 h-5 mb-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        }
      />

      <NavItem
        active={activeTab === "profile"}
        label="Profile"
        onClick={() => handleTab("profile")}
        icon={
          <svg className="w-5 h-5 mb-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
        }
      />
    </nav>
  );
}

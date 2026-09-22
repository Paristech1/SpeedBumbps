"use client";

import { motion } from "framer-motion";
import type { TabId } from "@/types/user-data";

interface BottomNavBarProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
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
      aria-current={active ? "page" : undefined}
      className={`relative flex-1 flex flex-col items-center justify-center gap-1.5 pt-3 pb-1 transition-colors active:opacity-60 ${
        active ? "text-[#E6EAF0]" : "text-[#5B6E7F] hover:text-[#B6BECB]"
      }`}
    >
      {/* The active tab is marked by a streak of light on the bar's top edge,
          not a filled pill — surfaces separate by hairline. */}
      {active && (
        <motion.span
          layoutId="bottom-nav-streak"
          className="absolute -top-px left-1/2 -translate-x-1/2 h-[2px] w-12 bg-[linear-gradient(90deg,transparent,#E6EAF0_30%,#E6EAF0_70%,transparent)]"
          transition={{ type: "spring", stiffness: 420, damping: 38 }}
          aria-hidden
        />
      )}
      {icon}
      <span className="kicker text-[10px] tracking-[0.18em] text-current">{label}</span>
    </button>
  );
}

/**
 * Bottom navigation — four tabs set as type, flush to the void.
 * Planning a route lives in the search bar at the top; there is no filled
 * action button here, because Nocturne's primary actions are type.
 * Sits above tab drawers (z-1060) so tabs stay tappable while one is open.
 */
export function BottomNavBar({ activeTab, onTabChange }: BottomNavBarProps) {
  // Re-tapping the active tab returns to the map
  const handleTab = (tab: TabId) => onTabChange(activeTab === tab ? "explore" : tab);
  const iconCls = "w-[18px] h-[18px]";

  return (
    <nav className="fixed bottom-0 left-0 w-full z-[1060] flex items-stretch px-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] bg-[#07090A]/92 backdrop-blur-xl nv-hairline-t">
      <NavItem
        active={activeTab === "explore"}
        label="Explore"
        onClick={() => onTabChange("explore")}
        icon={
          <svg className={iconCls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round">
            <path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Z" />
            <path d="M9 4v14M15 6v14" />
          </svg>
        }
      />
      <NavItem
        active={activeTab === "saved"}
        label="Saved"
        onClick={() => handleTab("saved")}
        icon={
          <svg className={iconCls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round">
            <path d="M18 21l-6-4.5L6 21V4.5A1.5 1.5 0 0 1 7.5 3h9A1.5 1.5 0 0 1 18 4.5z" />
          </svg>
        }
      />
      <NavItem
        active={activeTab === "reports"}
        label="Reports"
        onClick={() => handleTab("reports")}
        icon={
          // A bump in profile: the road, and the hump in it.
          <svg className={iconCls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
            <path d="M2 17h5c1.5 0 2.2-6 5-6s3.5 6 5 6h5" />
          </svg>
        }
      />
      <NavItem
        active={activeTab === "profile"}
        label="Profile"
        onClick={() => handleTab("profile")}
        icon={
          <svg className={iconCls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
            <circle cx="12" cy="8" r="3.5" />
            <path d="M5 20c.8-3.5 3.6-5.5 7-5.5s6.2 2 7 5.5" strokeLinecap="round" />
          </svg>
        }
      />
    </nav>
  );
}

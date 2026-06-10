"use client";

import { MapPin } from "lucide-react";
import type { TabId } from "@/types/user-data";

interface BottomNavBarProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  onFabClick: () => void;
}

const TAB_ACTIVE = "flex flex-col items-center justify-center bg-blue-500/20 text-blue-300 rounded-[24px] px-5 py-2 active:scale-90 duration-150";
const TAB_INACTIVE = "flex flex-col items-center justify-center text-slate-500 px-5 py-2 hover:text-blue-200 transition-all active:scale-90 duration-150";

/**
 * Bottom navigation — Velocity Dark shared component.
 * Sits above tab drawers (z-1060) so tabs stay tappable while one is open.
 */
export function BottomNavBar({ activeTab, onTabChange, onFabClick }: BottomNavBarProps) {
  const tabClass = (tab: TabId) => (activeTab === tab ? TAB_ACTIVE : TAB_INACTIVE);
  // Re-tapping the active tab returns to the map
  const handleTab = (tab: TabId) => onTabChange(activeTab === tab ? "explore" : tab);

  return (
    <nav className="fixed bottom-0 left-0 w-full z-[1060] flex justify-around items-center px-4 pb-8 pt-4 bg-[#111319]/80 backdrop-blur-xl rounded-t-[32px] border-t border-slate-700/20 shadow-[0_-8px_30px_rgb(0,0,0,0.5)]">
      <button className={tabClass("explore")} onClick={() => onTabChange("explore")} aria-label="Explore">
        <svg className="w-6 h-6 mb-1" viewBox="0 0 24 24" fill="currentColor"><path d="M20.5 3l-.16.03L15 5.1 9 3 3.36 4.9c-.21.07-.36.25-.36.48V20.5c0 .28.22.5.5.5l.16-.03L9 18.9l6 2.1 5.64-1.9c.21-.07.36-.25.36-.48V3.5c0-.28-.22-.5-.5-.5zM15 19l-6-2.11V5l6 2.11V19z"/></svg>
        <span className="font-[var(--font-body)] text-[10px] font-semibold uppercase tracking-widest">Explore</span>
      </button>
      <button className={tabClass("saved")} onClick={() => handleTab("saved")} aria-label="Saved">
        <svg className="w-6 h-6 mb-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
        <span className="font-[var(--font-body)] text-[10px] font-semibold uppercase tracking-widest">Saved</span>
      </button>
      {/* SpeedBumps Signature FAB */}
      <div className="relative -top-8">
        <button
          onClick={onFabClick}
          className="w-16 h-16 rounded-full bg-gradient-to-br from-[#9ecaff] to-[#2196F3] flex items-center justify-center text-[#003258] shadow-[0_0_30px_rgba(33,150,243,0.5)] border-4 border-[#111319] active:scale-95 transition-all"
          aria-label="Plan route"
        >
          <MapPin className="w-7 h-7" />
        </button>
      </div>
      <button className={tabClass("reports")} onClick={() => handleTab("reports")} aria-label="Reports">
        <svg className="w-6 h-6 mb-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
        <span className="font-[var(--font-body)] text-[10px] font-semibold uppercase tracking-widest">Reports</span>
      </button>
      <button className={tabClass("profile")} onClick={() => handleTab("profile")} aria-label="Profile">
        <svg className="w-6 h-6 mb-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        <span className="font-[var(--font-body)] text-[10px] font-semibold uppercase tracking-widest">Profile</span>
      </button>
    </nav>
  );
}

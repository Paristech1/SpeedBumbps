"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/hooks/useTheme";

/**
 * MapThemeSwitcher - Toggle between light and dark themes
 * Also switches the base map tile layer accordingly
 */
export function MapThemeSwitcher() {
  const { theme, toggleTheme, mounted } = useTheme();

  // Prevent hydration mismatch
  if (!mounted) {
    return (
      <button className="rounded-full bg-white p-2 shadow-lg">
        <div className="h-5 w-5" />
      </button>
    );
  }

  return (
    <button
      onClick={toggleTheme}
      className="rounded-full nv-glass p-2 hover:bg-white/5 transition-colors"
      title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      aria-label={
        theme === "dark" ? "Switch to light mode" : "Switch to dark mode"
      }
    >
      {theme === "dark" ? (
        <Sun className="h-5 w-5 text-[#B6BECB]" />
      ) : (
        <Moon className="h-5 w-5 text-[#5B6E7F]" />
      )}
    </button>
  );
}

import React from "react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  hint: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

export function EmptyState({
  icon,
  title,
  hint,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center px-8 py-14 gap-3",
        className
      )}
    >
      <div className="w-16 h-16 rounded-full bg-sb-surface-container flex items-center justify-center border border-sb-outline-variant/30 text-sb-outline">
        {icon}
      </div>
      <div className="text-base font-[var(--font-headline)] font-bold text-sb-on-surface">
        {title}
      </div>
      <p className="text-sm text-sb-on-surface-variant max-w-xs font-[var(--font-body)]">
        {hint}
      </p>
      {action && (
        <button
          onClick={action.onClick}
          className="mt-2 px-5 py-2 rounded-full bg-sb-primary/15 hover:bg-sb-primary/25 border border-sb-primary/30 text-sb-primary text-xs font-bold tracking-wide transition-all active:scale-95"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

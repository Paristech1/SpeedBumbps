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
      <div className="w-14 h-14 rounded-full nv-hairline flex items-center justify-center text-[#5B6E7F]">
        {icon}
      </div>
      <div className="mast mast-3 text-[#E6EAF0] mt-1">
        {title}
      </div>
      <p className="ui-sm text-[#5B6E7F] max-w-xs">
        {hint}
      </p>
      {action && (
        <button
          onClick={action.onClick}
          className="nv-chip mono-bar mt-2 px-5 py-2.5 hover:text-[#E6EAF0] transition-all active:scale-95"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

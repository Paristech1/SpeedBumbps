'use client';

import { useState, useCallback, useEffect } from 'react';
import type { LatLng, SpeedBump } from '@/types/speedbumps';
import { USER_REPORTS_STORAGE_KEY, type UserReport } from '@/types/user-data';
import { setUserReportedBumps, USER_REPORTS_CHANGED_EVENT } from '@/lib/speed-bump-service';

export { USER_REPORTS_CHANGED_EVENT };

/**
 * User reports are trusted locally (isVerified: true) so they count
 * toward bump avoidance; source: 'user' keeps them distinguishable.
 */
function reportToSpeedBump(report: UserReport): SpeedBump {
  return {
    id: report.id,
    location: report.location,
    severity: report.severity,
    isVerified: true,
    source: 'user',
  };
}

function syncToBumpService(reports: UserReport[]) {
  setUserReportedBumps(reports.map(reportToSpeedBump));
  window.dispatchEvent(new Event(USER_REPORTS_CHANGED_EVENT));
}

/**
 * Hook for managing user-submitted speed bump reports.
 * Persists to localStorage and pushes reports into the speed-bump
 * service so they appear as markers and count in route avoidance.
 */
export function useUserReports() {
  const [reports, setReports] = useState<UserReport[]>([]);

  // localStorage hydration must happen post-mount (SSR renders defaults first)
  useEffect(() => {
    try {
      const stored = localStorage.getItem(USER_REPORTS_STORAGE_KEY);
      const loaded = stored ? (JSON.parse(stored) as UserReport[]) : [];
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setReports(loaded);
      syncToBumpService(loaded);
    } catch (error) {
      console.error('Failed to load reports from localStorage:', error);
    }
  }, []);

  const persist = useCallback((next: UserReport[]) => {
    try {
      localStorage.setItem(USER_REPORTS_STORAGE_KEY, JSON.stringify(next));
    } catch (error) {
      console.error('Failed to save reports to localStorage:', error);
    }
    syncToBumpService(next);
  }, []);

  const addReport = useCallback(
    (input: { location: LatLng; severity: number; note?: string }): UserReport => {
      const report: UserReport = {
        ...input,
        id: `user-report-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
        createdAt: Date.now(),
      };
      setReports((prev) => {
        const next = [report, ...prev];
        persist(next);
        return next;
      });
      return report;
    },
    [persist]
  );

  const deleteReport = useCallback(
    (id: string) => {
      setReports((prev) => {
        const next = prev.filter((r) => r.id !== id);
        persist(next);
        return next;
      });
    },
    [persist]
  );

  return { reports, addReport, deleteReport };
}

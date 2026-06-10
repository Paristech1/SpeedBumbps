'use client';

import { useState, useCallback, useEffect } from 'react';
import { DEFAULT_AVOIDANCE_PROFILE } from '@/types/speedbumps';
import { USER_PROFILE_STORAGE_KEY, type UserProfile } from '@/types/user-data';

const DEFAULT_PROFILE: UserProfile = {
  displayName: 'Philly Driver',
  defaultProfile: DEFAULT_AVOIDANCE_PROFILE,
  updatedAt: 0,
};

/**
 * Hook for the local user profile (no auth — on-device only).
 * Defaults render first; localStorage hydrates in an effect.
 * `isLoaded` flips true once hydration finished, for one-time syncs.
 */
export function useUserProfile() {
  const [profile, setProfile] = useState<UserProfile>(DEFAULT_PROFILE);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(USER_PROFILE_STORAGE_KEY);
      if (stored) {
        setProfile({ ...DEFAULT_PROFILE, ...(JSON.parse(stored) as Partial<UserProfile>) });
      }
    } catch (error) {
      console.error('Failed to load profile from localStorage:', error);
    } finally {
      setIsLoaded(true);
    }
  }, []);

  const updateProfile = useCallback((partial: Partial<UserProfile>) => {
    setProfile((prev) => {
      const next: UserProfile = { ...prev, ...partial, updatedAt: Date.now() };
      try {
        localStorage.setItem(USER_PROFILE_STORAGE_KEY, JSON.stringify(next));
      } catch (error) {
        console.error('Failed to save profile to localStorage:', error);
      }
      return next;
    });
  }, []);

  return { profile, updateProfile, isLoaded };
}

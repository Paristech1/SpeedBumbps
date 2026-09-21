/**
 * POI category configurations
 */

import type { POICategoryConfig } from '@/types/poi';

export const POI_CATEGORIES: POICategoryConfig[] = [
  {
    id: 'food-drink',
    name: 'Food & Drink',
    color: '#B6BECB',
    bgColor: 'rgba(230, 234, 240, 0.08)',
    icon: '🍽️',
  },
  {
    id: 'shopping',
    name: 'Shopping',
    color: '#B6BECB',
    bgColor: 'rgba(230, 234, 240, 0.08)',
    icon: '🛍️',
  },
  {
    id: 'transport',
    name: 'Transport',
    color: '#B6BECB',
    bgColor: 'rgba(230, 234, 240, 0.08)',
    icon: '🚌',
  },
  {
    id: 'lodging',
    name: 'Lodging',
    color: '#B6BECB',
    bgColor: 'rgba(230, 234, 240, 0.08)',
    icon: '🏨',
  },
  {
    id: 'health',
    name: 'Health',
    color: '#B6BECB',
    bgColor: 'rgba(230, 234, 240, 0.08)',
    icon: '🏥',
  },
  {
    id: 'entertainment',
    name: 'Entertainment',
    color: '#B6BECB',
    bgColor: 'rgba(230, 234, 240, 0.08)',
    icon: '🎭',
  },
  {
    id: 'nature',
    name: 'Nature',
    color: '#B6BECB',
    bgColor: 'rgba(230, 234, 240, 0.08)',
    icon: '🌳',
  },
  {
    id: 'services',
    name: 'Services',
    color: '#B6BECB',
    bgColor: 'rgba(230, 234, 240, 0.08)',
    icon: '🔧',
  },
  {
    id: 'education',
    name: 'Education',
    color: '#B6BECB',
    bgColor: 'rgba(230, 234, 240, 0.08)',
    icon: '🎓',
  },
  {
    id: 'religion',
    name: 'Religion',
    color: '#B6BECB',
    bgColor: 'rgba(230, 234, 240, 0.08)',
    icon: '⛪',
  },
  {
    id: 'business',
    name: 'Business',
    color: '#B6BECB',
    bgColor: 'rgba(230, 234, 240, 0.08)',
    icon: '💼',
  },
  {
    id: 'tourism',
    name: 'Tourism',
    color: '#B6BECB',
    bgColor: 'rgba(230, 234, 240, 0.08)',
    icon: '📸',
  },
  {
    id: 'emergency',
    name: 'Emergency',
    color: '#B6BECB',
    bgColor: 'rgba(230, 234, 240, 0.08)',
    icon: '🚨',
  },
  {
    id: 'utilities',
    name: 'Utilities',
    color: '#B6BECB',
    bgColor: 'rgba(230, 234, 240, 0.08)',
    icon: '⚡',
  },
];

/**
 * Get category config by ID
 */
export function getCategoryById(id: string): POICategoryConfig | undefined {
  return POI_CATEGORIES.find((cat) => cat.id === id);
}

/**
 * Get category color by ID
 */
export function getCategoryColor(id: string): string {
  return getCategoryById(id)?.color || '#5B6E7F';
}

/**
 * Get category background color by ID
 */
export function getCategoryBgColor(id: string): string {
  return getCategoryById(id)?.bgColor || '#d1d5db';
}

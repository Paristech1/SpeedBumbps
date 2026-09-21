import { describe, it, expect } from 'vitest';
import { maneuverHeadline } from '@/lib/maneuver-display';

describe('maneuverHeadline', () => {
  it('pulls the turn direction out as the action', () => {
    expect(maneuverHeadline('Turn right onto Spruce St')).toEqual({
      action: 'Right',
      detail: 'onto Spruce St',
    });
    expect(maneuverHeadline('Turn left onto N Broad St')).toEqual({
      action: 'Left',
      detail: 'onto N Broad St',
    });
  });

  it('keeps two-word directions together', () => {
    expect(maneuverHeadline('Slight left onto Ridge Ave')).toEqual({
      action: 'Slight left',
      detail: 'onto Ridge Ave',
    });
    expect(maneuverHeadline('Sharp right onto Pine St')).toEqual({
      action: 'Sharp right',
      detail: 'onto Pine St',
    });
    expect(maneuverHeadline('Keep left onto I-76 W')).toEqual({
      action: 'Keep left',
      detail: 'onto I-76 W',
    });
    expect(maneuverHeadline('Merge right onto Vine St Expy')).toEqual({
      action: 'Merge right',
      detail: 'onto Vine St Expy',
    });
  });

  it('shortens the wordy maneuvers', () => {
    expect(maneuverHeadline('Continue straight onto Walnut St')).toEqual({
      action: 'Straight',
      detail: 'onto Walnut St',
    });
    expect(maneuverHeadline('Take the ramp on the left onto I-95 N')).toEqual({
      action: 'Ramp left',
      detail: 'onto I-95 N',
    });
    expect(maneuverHeadline('At end of road, turn right onto S 20th St')).toEqual({
      action: 'Right',
      detail: 'onto S 20th St',
    });
    expect(maneuverHeadline('Make a U-turn')).toEqual({ action: 'U-turn', detail: '' });
  });

  it('handles start and end of route', () => {
    expect(maneuverHeadline('Head on Chestnut St')).toEqual({
      action: 'Head',
      detail: 'on Chestnut St',
    });
    expect(maneuverHeadline('Arrive at destination')).toEqual({
      action: 'Arrive',
      detail: 'at destination',
    });
    expect(maneuverHeadline('Depart')).toEqual({ action: 'Depart', detail: '' });
  });

  it('keeps roundabout context on the detail line', () => {
    expect(maneuverHeadline('Exit roundabout onto Market St')).toEqual({
      action: 'Exit',
      detail: 'roundabout onto Market St',
    });
    expect(maneuverHeadline('Take the roundabout to Market St')).toEqual({
      action: 'Roundabout',
      detail: 'to Market St',
    });
  });

  it('falls back to a preposition split, then to the whole string', () => {
    expect(maneuverHeadline('Bear starboard onto Spruce St')).toEqual({
      action: 'Bear starboard',
      detail: 'onto Spruce St',
    });
    expect(maneuverHeadline('Follow the detour signs')).toEqual({
      action: 'Follow the detour signs',
      detail: '',
    });
    expect(maneuverHeadline('  ')).toEqual({ action: '', detail: '' });
  });
});

/**
 * Valhalla maneuver type → OSRM step type + modifier, so /api/route can
 * return OSRM-shaped steps (lib/osrm-service.ts turns those into
 * instructions, icons and voice prompts).
 *
 * Enum: https://valhalla.github.io/valhalla/turn-by-turn/api-reference/#maneuver-types
 * (checked against live responses: 10 = "Turn right onto …", 9 = "Bear right …").
 */

const VALHALLA_TO_OSRM: Record<number, { type: string; modifier: string }> = {
  1: { type: 'depart', modifier: '' }, // kStart
  2: { type: 'depart', modifier: 'right' }, // kStartRight
  3: { type: 'depart', modifier: 'left' }, // kStartLeft
  4: { type: 'arrive', modifier: '' }, // kDestination
  5: { type: 'arrive', modifier: 'right' }, // kDestinationRight
  6: { type: 'arrive', modifier: 'left' }, // kDestinationLeft
  7: { type: 'new name', modifier: 'straight' }, // kBecomes
  8: { type: 'continue', modifier: 'straight' }, // kContinue
  9: { type: 'turn', modifier: 'slight right' }, // kSlightRight
  10: { type: 'turn', modifier: 'right' }, // kRight
  11: { type: 'turn', modifier: 'sharp right' }, // kSharpRight
  12: { type: 'turn', modifier: 'uturn' }, // kUturnRight
  13: { type: 'turn', modifier: 'uturn' }, // kUturnLeft
  14: { type: 'turn', modifier: 'sharp left' }, // kSharpLeft
  15: { type: 'turn', modifier: 'left' }, // kLeft
  16: { type: 'turn', modifier: 'slight left' }, // kSlightLeft
  17: { type: 'on ramp', modifier: 'straight' }, // kRampStraight
  18: { type: 'on ramp', modifier: 'right' }, // kRampRight
  19: { type: 'on ramp', modifier: 'left' }, // kRampLeft
  20: { type: 'off ramp', modifier: 'right' }, // kExitRight
  21: { type: 'off ramp', modifier: 'left' }, // kExitLeft
  22: { type: 'fork', modifier: 'straight' }, // kStayStraight
  23: { type: 'fork', modifier: 'slight right' }, // kStayRight
  24: { type: 'fork', modifier: 'slight left' }, // kStayLeft
  25: { type: 'merge', modifier: '' }, // kMerge
  26: { type: 'roundabout', modifier: '' }, // kRoundaboutEnter
  27: { type: 'exit roundabout', modifier: '' }, // kRoundaboutExit
  37: { type: 'merge', modifier: 'slight right' }, // kMergeRight
  38: { type: 'merge', modifier: 'slight left' }, // kMergeLeft
};

export function valhallaTypeToOsrm(type: number): { type: string; modifier: string } {
  return VALHALLA_TO_OSRM[type] ?? { type: 'continue', modifier: '' };
}

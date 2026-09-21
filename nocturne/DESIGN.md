# Nocturne Velocity

The design language SpeedBumps ships. Blue-hour steel, crushed black, and two
accents that never do each other's job. This file mirrors the external handoff
(`speedbumps-handoff/HANDOFF.md`, commit `c9a3cb2`); the drop-in stylesheet
lives here as `app/nocturne.css`.

Supersedes `velocity_dark/DESIGN.md`.

## Rules

- Two accents, one job each: **flare** (hot pink) marks the hazard — the next
  bump, bump counts, harshness, warnings, destructive actions. **Teal** marks
  what the driver chose — their route, the option they picked, the top hit.
  Neither stands in for the other, and a screen carries at most one mark of
  each. Accents are never a row of buttons.
- One diagonal per composition. The diagonal lives in the map. Type stays
  orthogonal.
- Sharp type, soft world. Blur and grain stay off the glyphs.
- One lowercase caption per screen: wide tracking, fog, trailing period.
- No logos.
- Primary actions are type, not filled buttons: mast labels (`SEND`,
  `PLOT ROUTE`, `REPORT A BUMP`) or mono bars (`TAKE SMOOTHEST`, `END`).

## Tokens

| Token | CSS variable | Hex | Role |
|---|---|---|---|
| void | `--nv-void` | `#07090A` | Base, crushed black |
| asphalt | `--nv-asphalt` | `#0C1416` | Surfaces, sheets |
| slate-blue | `--nv-slate` | `#5B6E7F` | Secondary text, idle markers |
| fog | `--nv-fog` | `#B6BECB` | Captions, inactive chrome |
| chrome | `--nv-chrome` | `#E6EAF0` | Primary text, hairlines, streaks |
| flare | `--nv-flare` | `#FF3D8E` | The hazard — next bump, harshness, warnings |
| teal | `--nv-teal` | `#2BD9CE` | The chosen — your route, your pick, the top hit |
| glass | `--nv-glass` | `#0C14169E` | Frosted pills over the map |
| hairline | `--nv-hairline` | `#E6EAF01F` | 1 px steel edges |

Surfaces separate by hairline, not by a ladder of greys. Hover and pressed
states are chrome washes (`--nv-wash`), never a new surface colour.

## Type

| Role | Face | Classes |
|---|---|---|
| Mast | Barlow Condensed 700 | `.mast` + `.mast-1` … `.mast-4` |
| UI | Inter Tight | `.ui-text`, `.ui-sm`, `.caption` |
| Mono | Geist Mono | `.kicker`, `.mono-bar` |

Mast sizes are set in `cqw`, so type scales with the frame it sits in. Put
`.nv-frame` on the sheet or card that should act as that frame — never on an
element whose width comes from its own content, since the containment it sets
would collapse the box.

## Screens

| # | Screen | Accents (one of each, at most) | Caption |
|---|---|---|---|
| 01 | Welcome | — | *(not built; `/` opens the map)* |
| 02 | Map home | next-bump marker (flare) | `14 bumps within 1 mi.` |
| 03 | Search | first address dot (teal) | `exact first. places after.` |
|  | — the sheet becomes the search screen while typing: ADDRESSES then PLACES, `DROP A PIN` at the foot ||
| 04 | Route preview | chosen route + chosen minutes (teal) | `3 bumps on this one.` |
| 05 | Navigating | route (teal), next bump + its digits (flare) | `speed table in 250 ft.` |
| 06 | Report a bump | selected harshness digit (flare) | `one tap. we verify later.` |

## Map

Tiles are CARTO's dark style, carried to blue-hour by a light contrast pass on
the tile pane plus a steel veil above it (`.leaflet-container::after`, between
the tile pane and the overlays). Everything the app draws sits above the veil
and keeps its own colour.

Bumps are round dots, sized by state.

| Element | Colour |
|---|---|
| Idle bump | slate-blue dot |
| Bump on your route | chrome dot, void stroke |
| Next bump ahead | flare dot with a halo (exactly one) |
| Chosen route | teal, driving or previewing |
| Alternate route | slate-blue, dashed |
| User location | chrome dot, void stroke |
| Destination | hollow chrome ring |

## File map

| What | File |
|---|---|
| Tokens, mast/kicker/caption, surfaces | `app/nocturne.css` |
| Theme wiring, legacy token aliases | `app/globals.css` |
| The three faces | `app/layout.tsx` |
| Navigating (05) | `components/map/NavigationBar.tsx` |
| Search (03) + planner | `components/map/RoutePlanningPanel.tsx` |
| Route preview (04) | `components/map/RouteResultCard.tsx` |
| Map home (02) | `components/map/MapMain.tsx`, `components/map/BottomNavBar.tsx` |
| Report a bump (06) | `components/map/ReportsPanel.tsx` |
| Next bump ahead | `lib/bump-ahead.ts` |
| Maneuver → mast word | `lib/maneuver-display.ts` |

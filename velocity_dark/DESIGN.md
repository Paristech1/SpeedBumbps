# Design System Specification: The Kinetic Luminescence

## 1. Overview & Creative North Star
**Creative North Star: "The Neon Navigator"**
This design system moves away from the static, boxy constraints of traditional GPS applications. Instead, it embraces a "Liquid-Futurist" aesthetic—where information floats over dark, cinematic map tiles. By prioritizing atmospheric depth, we treat the mobile screen not as a flat surface, but as a multi-layered heads-up display (HUD).

We break the "template" look through **intentional layering**. By overlapping glass cards and using high-contrast typography scales (Space Grotesk for impact, Manrope for utility), we create an interface that feels like a premium automotive instrument cluster rather than a standard utility app.

---

## 2. Colors & Surface Intelligence
Our palette is rooted in the deep void of the night, punctured by high-energy light.

### Tonal Foundations
*   **Background:** `#111319` (The Canvas)
*   **Surface:** `#111319` (The Base Layer)
*   **Surface Container (Lowest to Highest):** `#0c0e14` → `#191b22` → `#1e1f26` → `#282a30` → `#33343b`

### The "No-Line" Rule
**Strict Mandate:** 1px solid borders for sectioning are strictly prohibited. 
Structural boundaries must be achieved through **Background Color Shifts**. For example, a map search bar (`surface-container-high`) should sit atop the map tile without a stroke, using only its tonal elevation to define its footprint.

### The Glass & Gradient Rule
To achieve the "2025" futuristic aesthetic, all floating UI elements (Modals, Turn-by-Turn cards) must utilize **Glassmorphism**:
*   **Material:** `surface-container-highest` at 60-80% opacity.
*   **Effect:** `backdrop-filter: blur(20px)`.
*   **Signature Polish:** Apply a subtle linear gradient to Primary CTAs, transitioning from `primary` (#9ecaff) to `primary-container` (#2196f3) at a 135° angle.

---

## 3. Typography: The Editorial Scale
We use a dual-font strategy to balance high-speed readability with a premium, geometric soul.

*   **Display & Headlines (Space Grotesk):** Our "Command" typeface. Used for trip ETAs, speed limits, and major headers. Its wide apertures ensure legibility at a glance.
    *   *Display-Lg (3.5rem):* For critical data like "Time to Destination."
*   **Body & Labels (Manrope):** Our "Utility" typeface. Used for street names, settings, and instructional text. Its balanced proportions feel modern and approachable.
    *   *Title-Md (1.125rem):* The standard for street name labels.
    *   *Label-Sm (0.6875rem):* For micro-data like "GPS Signal" or "Battery."

---

## 4. Elevation & Depth
In this system, depth is a functional tool, not just a decoration.

### The Layering Principle
Hierarchy is achieved by stacking surface tiers. 
*   **Map Level:** `surface-container-lowest`
*   **Persistent UI (Bottom Nav):** `surface-container-low`
*   **Floating Action Cards:** `surface-container-highest` + `glassmorphism`

### Ambient Shadows
When an element must "hover" over the map:
*   **Shadow:** Extra-diffused. `Blur: 40px-60px`. 
*   **Opacity:** 4-8%.
*   **Color:** Use a tinted version of `on-surface` (`#e2e2eb`) to simulate ambient light reflection rather than a "dirty" black shadow.

### The "Ghost Border" Fallback
If an element requires a definition against a similarly colored background, use a **Ghost Border**:
*   **Token:** `outline-variant` (#404752) at 15% opacity. Never use 100% opacity.

---

## 5. Component Logic

### Navigation Cards
*   **Geometry:** 1.5rem (24px) to 2rem (32px) corner radius. Large radii feel "friendlier" and more organic.
*   **Layout:** Forbid dividers. Use `8px`, `16px`, or `24px` vertical whitespace to separate "Next Turn" from "Distance."

### Primary Action Buttons
*   **Shape:** 999px (Pill).
*   **Color:** `primary` (#9ecaff) with `on-primary` (#003258) text.
*   **State:** On press, scale down to 96% to provide haptic visual feedback.

### Status Chips (SpeedBumps Specific)
*   **Variants:** 
    *   *Hazard:* `warning-orange` (#FF6B00) background, low opacity, with a high-contrast icon.
    *   *Police/Speed Trap:* `primary-container` (#2196f3) glass.
*   **Interaction:** Pill-shaped, minimal padding (8px 16px), floating state.

### Map Overlays
*   **Tile Style:** Dark slate/charcoal.
*   **Contrast:** Routes use `secondary` (#44d8f1) with a soft outer glow (neon effect) to ensure the path is the highest-contrast element on the screen.

---

## 6. Do’s and Don'ts

### Do
*   **Do** use extreme scale for ETAs. Make the numbers big and bold.
*   **Do** use `surface-bright` (#373940) for active states in lists to create a "glow" effect.
*   **Do** lean into asymmetry. A card aligned to the left with a "floating" action button on the right creates a custom, high-end feel.

### Don't
*   **Don't** use pure black (#000000). It kills the "glass" effect. Use `surface-container-lowest`.
*   **Don't** use standard 1px dividers. They make the app look like a list of emails rather than a futuristic navigator.
*   **Don't** use "Drop Shadows" on text. Use high-contrast color pairings (`on-surface` on `surface`) for legibility.
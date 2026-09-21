# Working agreement

## Previews before pushes

Show the work before it leaves the machine. For any UI change:

1. Build it and capture screenshots of the affected screens (see below).
2. Send the screenshots and wait.
3. Push to a branch, or open a PR, only after Paris approves.

No branch push, force-push, or PR on my own initiative — not even when the
work is finished, the tests pass and the change looks obviously right.
Committing locally while waiting is fine, and preferred: it keeps the diff
ready to push the moment it's approved.

Once a PR is open, pushes that answer its review comments or a red CI run
follow the same rule: previews first for anything visual.

## Capturing screenshots

The app is a Next.js + Leaflet PWA; drive it with Playwright against a
production build.

```bash
npm run build && PORT=3200 npm start        # background it
```

Chromium is preinstalled at `/opt/pw-browsers/chromium` — launch with
`executablePath`, never `playwright install`. Shoot at 390×844 (and 360×780
for the tight case) with `deviceScaleFactor: 2`, and park the pointer
(`page.mouse.move(6, 6)`) before each shot so hover states stay out of frame.

This sandbox has no outbound network, so tiles, routing and place search
must be stubbed with `context.route()`. The local OPA address index and the
bump dataset are real and work offline — prefer them over stubs, and say
which parts of a screenshot are stood in for.

## Design

`nocturne/DESIGN.md` is the source of truth for the palette, type and the
accent rules. `velocity_dark/DESIGN.md` is superseded.

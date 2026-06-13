/**
 * Admin "Log mode" diagnostic logger (client-only, no backend).
 *
 * The user toggles capture from Profile → Log mode → Start. While capturing,
 * structured events plus console.error/console.warn are recorded into a
 * bounded in-memory buffer, then exported (download / clipboard) so the
 * bundle can be handed back to Claude to debug and improve the app.
 *
 * Privacy: precise GPS coordinates and address labels are coarsened/redacted
 * by default. The user can opt in to precise location from the panel.
 */

export type LogLevel = 'info' | 'warn' | 'error';

export interface LogEntry {
  ts: number;
  level: LogLevel;
  source: string;
  message: string;
  data?: unknown;
}

export interface CaptureOptions {
  /** Include full-precision coordinates and address labels in the bundle. */
  includePreciseLocation?: boolean;
}

export interface DiagnosticsBundle {
  app: string;
  capturedAt: string;
  preciseLocation: boolean;
  environment: Record<string, unknown>;
  entryCount: number;
  entries: LogEntry[];
}

const APP_NAME = 'SpeedBumps';
const MAX_ENTRIES = 500;

let capturing = false;
let includePrecise = false;
let entries: LogEntry[] = [];
let environment: Record<string, unknown> = {};
let startedAt = 0;

const listeners = new Set<() => void>();
let originalError: typeof console.error | null = null;
let originalWarn: typeof console.warn | null = null;

function notify(): void {
  for (const l of listeners) l();
}

/** Subscribe to capture-state/entry changes (for live UI). Returns unsubscribe. */
export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function isCapturing(): boolean {
  return capturing;
}

export function getEntryCount(): number {
  return entries.length;
}

export function getEntries(): LogEntry[] {
  return entries;
}

const COORD_KEY = /^(lat|lng|latitude|longitude)$/i;
const LABEL_KEY = /(label|address|displayName|shortName)/i;

/** Recursively coarsen coordinates and redact address labels unless opted in. */
function sanitize(value: unknown, depth = 0): unknown {
  if (depth > 6 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => sanitize(v, depth + 1));

  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    if (!includePrecise && COORD_KEY.test(key) && typeof val === 'number') {
      out[key] = Math.round(val * 1000) / 1000; // ~110 m precision
    } else if (!includePrecise && LABEL_KEY.test(key) && typeof val === 'string') {
      out[key] = '[redacted]';
    } else {
      out[key] = sanitize(val, depth + 1);
    }
  }
  return out;
}

/** Record an event. No-op (near-zero cost) unless capture is active. */
export function log(level: LogLevel, source: string, message: string, data?: unknown): void {
  if (!capturing) return;
  entries.push({
    ts: Date.now(),
    level,
    source,
    message,
    data: data === undefined ? undefined : sanitize(data),
  });
  if (entries.length > MAX_ENTRIES) entries = entries.slice(-MAX_ENTRIES);
  notify();
}

function snapshotEnvironment(): Record<string, unknown> {
  if (typeof window === 'undefined') return {};
  const nav = window.navigator;
  return {
    userAgent: nav.userAgent,
    language: nav.language,
    online: nav.onLine,
    platform: (nav as Navigator & { platform?: string }).platform ?? 'unknown',
    viewport: { width: window.innerWidth, height: window.innerHeight, dpr: window.devicePixelRatio },
    path: window.location.pathname, // no query string (may carry coords)
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
}

/** Begin capturing. Clears prior entries and patches console.error/warn. */
export function startCapture(options: CaptureOptions = {}): void {
  if (capturing) return;
  includePrecise = options.includePreciseLocation ?? false;
  entries = [];
  startedAt = Date.now();
  environment = snapshotEnvironment();
  capturing = true;

  if (typeof console !== 'undefined' && !originalError) {
    originalError = console.error.bind(console);
    originalWarn = console.warn.bind(console);
    console.error = (...args: unknown[]) => {
      log('error', 'console', args.map(stringifyArg).join(' '));
      originalError?.(...args);
    };
    console.warn = (...args: unknown[]) => {
      log('warn', 'console', args.map(stringifyArg).join(' '));
      originalWarn?.(...args);
    };
  }

  log('info', 'logmode', `Capture started${includePrecise ? ' (precise location ON)' : ''}`);
}

/** Stop capturing and restore the console. */
export function stopCapture(): void {
  if (!capturing) return;
  log('info', 'logmode', 'Capture stopped');
  capturing = false;
  if (originalError) {
    console.error = originalError;
    originalError = null;
  }
  if (originalWarn) {
    console.warn = originalWarn;
    originalWarn = null;
  }
  notify();
}

export function clearEntries(): void {
  entries = [];
  notify();
}

function stringifyArg(arg: unknown): string {
  if (arg instanceof Error) return `${arg.name}: ${arg.message}${arg.stack ? `\n${arg.stack}` : ''}`;
  if (typeof arg === 'string') return arg;
  try {
    return JSON.stringify(sanitize(arg));
  } catch {
    return String(arg);
  }
}

export function buildBundle(): DiagnosticsBundle {
  return {
    app: APP_NAME,
    capturedAt: new Date(startedAt || Date.now()).toISOString(),
    preciseLocation: includePrecise,
    environment,
    entryCount: entries.length,
    entries,
  };
}

export function bundleToJSON(): string {
  return JSON.stringify(buildBundle(), null, 2);
}

/** Trigger a download of the diagnostics bundle. */
export function downloadBundle(): void {
  if (typeof window === 'undefined') return;
  const blob = new Blob([bundleToJSON()], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `speedbumps-diagnostics-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Copy the diagnostics bundle to the clipboard. Resolves to success. */
export async function copyBundle(): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(bundleToJSON());
    return true;
  } catch {
    return false;
  }
}

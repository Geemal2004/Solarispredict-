export const colors = {
  bg: "#0c1017",
  panel: "#151b24",
  panelElevated: "#1a222d",
  mist: "#1e2834",
  line: "#2a3442",
  foreground: "#e8eef5",
  demand: "#6eb6ff",
  solar: "#e8a33d",
  monsoon: "#3ecf8e",
  risk: "#ff6b6b",
  inkMuted: "#8a96a8",
  readout: "#c5d0de",
} as const;

export const fonts = {
  display:
    'IBM Plex Sans, "Segoe UI", ui-sans-serif, system-ui, sans-serif',
  body: 'IBM Plex Sans, "Segoe UI", ui-sans-serif, system-ui, sans-serif',
  mono: 'IBM Plex Mono, ui-monospace, Consolas, monospace',
} as const;

/** 90s @ 30fps */
export const FPS = 30;
export const TOTAL_FRAMES = 90 * FPS;

export const scenes = {
  title: { from: 0, duration: 8 * FPS },
  problem: { from: 8 * FPS, duration: 20 * FPS },
  gap: { from: 28 * FPS, duration: 14 * FPS },
  solution: { from: 42 * FPS, duration: 33 * FPS },
  close: { from: 75 * FPS, duration: 15 * FPS },
} as const;

export const DEV_MODE = false;

export const ANIM_SPEED = 0.15;
export const GHOST_LERP_SPEED = 0.25;
export const SKIER_BROADCAST_INTERVAL = 66; // ~15Hz

export const GRAVITY = 1;
export const CRASH_VELOCITY_THRESHOLD = 12; // m/s - body impacts below this won't cause crash

export const SKIER_WIDTH = 20;
export const SKIER_HEIGHT = 30;

export const LINE_WIDTH = 4;

export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 2;
export const ZOOM_SPEED = 0.001;
export const PLAYING_ZOOM = 1.5;

export const LEVEL_BOUNDS = {
  maxWidth: 1920,
  maxHeight: 1080,
  minSeparation: 1 / 3,
} as const;

export const COUNTDOWN_SECONDS = 3;
export const ROUND_DURATION_SECONDS = 60 + COUNTDOWN_SECONDS; // 60 seconds + 3 second countdown
export const BASE_POINTS = 100;
export const FINISH_ZONE_RADIUS = 50;

export const COLORS = {
  background: '#FAFAFA',
  grid: '#E5E7EB',
  skier: '#1F2937',
  skis: '#EF4444',
  head: '#FCD34D',
  legs: '#374151',
  line: '#333333',
  lineHighlight: '#6366F1',
  startZone: '#3B82F6',
  finishZone: '#22C55E',
} as const;

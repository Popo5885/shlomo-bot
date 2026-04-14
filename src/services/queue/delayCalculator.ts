/**
 * Anti-Ban Delay Calculator
 *
 * Calculates the delay between messages to simulate human behavior.
 * Supports presets (fast/medium/slow), modes (fixed/random/burst),
 * and adds jitter to avoid predictable patterns.
 */

import type { DelayMode, DelayPreset } from '../../types/database.js';

export interface DelayConfig {
  delay_mode: DelayMode;
  delay_preset: DelayPreset | null;
  delay_min_seconds: number;
  delay_max_seconds: number;
}

// Preset ranges (in seconds)
const PRESETS: Record<string, { min: number; max: number }> = {
  fast:   { min: 3,   max: 5 },
  medium: { min: 30,  max: 60 },
  slow:   { min: 300, max: 600 },
};

// Burst mode: send N messages quickly, then pause
const BURST_QUICK_MIN_MS = 1000;
const BURST_QUICK_MAX_MS = 2500;
const BURST_SIZE_MIN = 3;
const BURST_SIZE_MAX = 5;

// Jitter: adds +-15% randomness to prevent exact patterns
const JITTER_FACTOR = 0.15;

/**
 * Resolve preset into min/max seconds.
 */
function resolveConfig(config: DelayConfig): { min: number; max: number } {
  if (config.delay_preset && config.delay_preset !== 'custom' && PRESETS[config.delay_preset]) {
    return PRESETS[config.delay_preset];
  }
  return { min: config.delay_min_seconds, max: config.delay_max_seconds };
}

/**
 * Add jitter: +-JITTER_FACTOR variation to a base delay.
 */
function addJitter(baseMs: number): number {
  const jitter = baseMs * JITTER_FACTOR * (2 * Math.random() - 1); // range: [-15%, +15%]
  return Math.max(500, Math.round(baseMs + jitter)); // min 500ms
}

/**
 * Calculate a single delay in milliseconds.
 */
export function calculateDelay(config: DelayConfig): number {
  const { min, max } = resolveConfig(config);

  switch (config.delay_mode) {
    case 'fixed':
      return addJitter(min * 1000);

    case 'random': {
      const baseMs = (Math.random() * (max - min) + min) * 1000;
      return addJitter(baseMs);
    }

    case 'burst':
      // Burst returns the "quick" delay; the caller handles the long pause
      return addJitter(
        Math.random() * (BURST_QUICK_MAX_MS - BURST_QUICK_MIN_MS) + BURST_QUICK_MIN_MS
      );

    default:
      return addJitter(min * 1000);
  }
}

/**
 * Calculate cumulative delays for a batch of N messages.
 * Returns an array of delays in ms: [0, delay1, delay1+delay2, ...]
 *
 * For burst mode: send BURST_SIZE messages quickly, then long pause, repeat.
 */
export function calculateBatchDelays(config: DelayConfig, count: number): number[] {
  if (count <= 0) return [];
  if (count === 1) return [0];

  const delays: number[] = [0]; // first message sends immediately
  let cumulative = 0;

  if (config.delay_mode === 'burst') {
    const { max } = resolveConfig(config);
    const burstSize = BURST_SIZE_MIN + Math.floor(Math.random() * (BURST_SIZE_MAX - BURST_SIZE_MIN + 1));

    for (let i = 1; i < count; i++) {
      const posInBurst = i % burstSize;

      if (posInBurst === 0) {
        // Long pause after burst completes
        cumulative += addJitter(max * 1000);
      } else {
        // Quick send within burst
        cumulative += calculateDelay(config);
      }

      delays.push(cumulative);
    }
  } else {
    for (let i = 1; i < count; i++) {
      cumulative += calculateDelay(config);
      delays.push(cumulative);
    }
  }

  return delays;
}

/**
 * Get a human-readable estimate of total batch time.
 */
export function estimateBatchDuration(config: DelayConfig, count: number): string {
  if (count <= 1) return '0s';

  const delays = calculateBatchDelays(config, count);
  const totalMs = delays[delays.length - 1];
  const totalSec = Math.round(totalMs / 1000);

  if (totalSec < 60) return `~${totalSec}s`;
  if (totalSec < 3600) return `~${Math.round(totalSec / 60)}m`;
  return `~${(totalSec / 3600).toFixed(1)}h`;
}

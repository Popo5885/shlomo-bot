/**
 * Shabbat Blocker Service
 *
 * Blocks message dispatch during Shabbat hours.
 * Synchronized to earliest entrance (Jerusalem) and latest exit (Petah Tikva).
 */

import { db } from '../../config/database.js';
import { logger } from '../../utils/logger.js';

interface ShabbatWindow {
  start: Date;  // Friday candle lighting
  end: Date;    // Saturday havdala
}

/**
 * Get approximate Shabbat times based on sunset calculations.
 * Jerusalem candle lighting = sunset - 40 min (earliest in Israel)
 * Petah Tikva havdala = sunset + 35 min (can be later than Jerusalem)
 */
function getShabbatWindow(date: Date): ShabbatWindow | null {
  const day = date.getDay();

  // Find the nearest Friday
  let friday: Date;
  if (day === 5) {
    friday = new Date(date);
  } else if (day === 6) {
    friday = new Date(date);
    friday.setDate(friday.getDate() - 1);
  } else {
    return null; // Not near Shabbat
  }

  // Approximate sunset times for Israel by month (Jerusalem)
  const month = friday.getMonth(); // 0-indexed
  const sunsetHours = [16.85, 17.25, 17.65, 18.95, 19.30, 19.55, 19.45, 19.10, 18.40, 17.60, 16.85, 16.65];
  const sunsetHour = sunsetHours[month];

  const candleLightingHour = Math.floor(sunsetHour);
  const candleLightingMin = Math.round((sunsetHour - candleLightingHour) * 60) - 40; // 40 min before sunset (Jerusalem)

  // Saturday sunset (approximately same, +1 day)
  const satSunsetHour = sunsetHours[month];
  const havdalaHour = Math.floor(satSunsetHour);
  const havdalaMin = Math.round((satSunsetHour - havdalaHour) * 60) + 35; // 35 min after sunset (Petah Tikva)

  const start = new Date(friday);
  start.setHours(candleLightingHour, candleLightingMin < 0 ? candleLightingMin + 60 : candleLightingMin, 0, 0);
  if (candleLightingMin < 0) start.setHours(start.getHours() - 1);

  const end = new Date(friday);
  end.setDate(end.getDate() + 1); // Saturday
  end.setHours(havdalaHour, havdalaMin >= 60 ? havdalaMin - 60 : havdalaMin, 0, 0);
  if (havdalaMin >= 60) end.setHours(end.getHours() + 1);

  return { start, end };
}

/**
 * Check if message dispatch should be blocked due to Shabbat.
 */
export async function isShabbatBlocked(workspaceId: string): Promise<boolean> {
  try {
    const settings = await db('shabbat_settings')
      .where({ workspace_id: workspaceId, is_enabled: true })
      .first();

    if (!settings) return false;

    // Use Israel timezone
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' }));
    const day = now.getDay();

    // Only check on Friday and Saturday
    if (day !== 5 && day !== 6) return false;

    const window = getShabbatWindow(now);
    if (!window) return false;

    // Apply custom offsets
    const start = new Date(window.start.getTime() + (settings.custom_start_offset_min || 0) * 60000);
    const end = new Date(window.end.getTime() + (settings.custom_end_offset_min || 0) * 60000);

    const blocked = now >= start && now <= end;
    if (blocked) {
      logger.info(`Shabbat blocker active for workspace ${workspaceId}: ${start.toISOString()} - ${end.toISOString()}`);
    }
    return blocked;
  } catch (err) {
    logger.error('Shabbat blocker check failed:', err);
    return false; // Fail-open: don't block on errors
  }
}

/**
 * Get next available send time after Shabbat.
 */
export function getNextAvailableTime(): Date {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' }));
  const window = getShabbatWindow(now);
  if (window && now >= window.start && now <= window.end) {
    return new Date(window.end.getTime() + 5 * 60000); // 5 min after havdala
  }
  return now;
}

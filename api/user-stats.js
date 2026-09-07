/**
 * Helper utilities for extracting cardio and pain history/status from user state.
 */

function extractDateStr(c) {
  if (!c) return null;
  const raw = c.date || c.d;
  if (typeof raw === 'string') {
    if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
      return raw.slice(0, 10);
    }
    const parsed = new Date(raw);
    if (!isNaN(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10);
    }
  }
  if (c.ts && !isNaN(Number(c.ts))) {
    try {
      const parsed = new Date(Number(c.ts));
      if (!isNaN(parsed.getTime())) {
        return parsed.toISOString().slice(0, 10);
      }
    } catch {}
  }
  return null;
}

export function userCardioStats(S) {
  const cardioLogs = Array.isArray(S?.cardioLogs) ? S.cardioLogs : [];
  let lastCardio = null;

  for (const c of cardioLogs) {
    if (!c) continue;
    const d = extractDateStr(c);
    if (d && (!lastCardio || d > lastCardio)) {
      lastCardio = d;
    }
  }

  return {
    lastCardio,
    cardioCount: cardioLogs.length
  };
}

export function userPainStats(S) {
  const painLogs = Array.isArray(S?.painLogs) ? S.painLogs : [];
  if (!painLogs.length) {
    return { hasPain: false, lastPainArea: null };
  }

  let latest = null;
  let latestTime = -Infinity;

  for (let i = 0; i < painLogs.length; i++) {
    const p = painLogs[i];
    if (!p) continue;
    let t = -Infinity;
    if (p.ts && !isNaN(Number(p.ts))) {
      t = Number(p.ts);
    } else if (p.date) {
      const parsed = new Date(p.date);
      if (!isNaN(parsed.getTime())) {
        t = parsed.getTime();
      }
    }
    // If no valid timestamp or date, fall back to array order
    if (t > latestTime || (t === latestTime && latest !== null) || latest === null) {
      latest = p;
      if (t !== -Infinity) latestTime = t;
    }
  }

  if (!latest) {
    return { hasPain: false, lastPainArea: null };
  }

  const hasPain = Boolean(
    latest.pain ?? latest.hasPain ?? (latest.level && latest.level !== 'ninguno' && latest.level !== 0)
  );

  return {
    hasPain,
    lastPainArea: hasPain ? (latest.area || latest.painArea || null) : null
  };
}

// Pure BARÈME scoring engine.
// Rule: exact match -> nearest higher threshold by direction -> clamp at boundary.
// No interpolation. Returns null (never 0) when no valid score can be produced.

export function parseRaw(v) {
  if (v === null || v === undefined) return NaN;
  if (typeof v === 'number') return v;
  const s = String(v).trim().replace(',', '.');
  const n = Number(s);
  return isNaN(n) ? NaN : n;
}

export function scoreWithBarme(rawInput, barme) {
  if (!barme) return { score: null, match: null, warning: 'no_barme' };
  const thresholds = Array.isArray(barme.thresholds) ? barme.thresholds : [];
  if (thresholds.length === 0) return { score: null, match: null, warning: 'no_thresholds' };

  const raw = parseRaw(rawInput);
  if (isNaN(raw)) return { score: null, match: null, warning: 'invalid_raw' };

  const dir = barme.direction === 'lower' ? 'lower' : 'higher';
  // normalize thresholds
  const ts = thresholds.map(t => ({ raw: parseRaw(t.raw), score: t.score }))
    .filter(t => !isNaN(t.raw))
    .sort((a, b) => a.raw - b.raw);

  if (ts.length === 0) return { score: null, match: null, warning: 'no_thresholds' };

  // exact
  const exact = ts.find(t => t.raw === raw);
  if (exact) return { score: exact.score, match: 'exact', raw };

  const min = ts[0];
  const max = ts[ts.length - 1];

  if (dir === 'higher') {
    if (raw < min.raw) return { score: min.score, match: 'clamped', raw };
    if (raw > max.raw) return { score: max.score, match: 'clamped', raw };
    // nearest higher
    const higher = ts.find(t => t.raw > raw);
    if (higher) return { score: higher.score, match: 'nearest_higher', raw };
    return { score: max.score, match: 'clamped', raw };
  } else {
    // lower is better: scores descend as raw rises
    if (raw < min.raw) return { score: max.score, match: 'clamped', raw };
    if (raw > max.raw) return { score: min.score, match: 'clamped', raw };
    // nearest higher raw threshold
    const higher = ts.find(t => t.raw > raw);
    if (higher) return { score: higher.score, match: 'nearest_higher', raw };
    return { score: min.score, match: 'clamped', raw };
  }
}

export function barmeVersionLabel(b) {
  if (!b) return null;
  return { id: b.id, name: b.name || b.test_type || 'BARÈME', version: b.version || 1 };
}
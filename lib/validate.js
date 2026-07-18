const CRON_FIELD_RANGES = [
  [0, 59],
  [0, 23],
  [1, 31],
  [1, 12],
  [0, 6],
];

export function isUrl(str) {
  try {
    const u = new URL(str);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export function validateCron(expr) {
  const fields = expr.trim().split(/\s+/);
  if (fields.length !== 5) {
    return `expected 5 fields, got ${fields.length}`;
  }
  for (let i = 0; i < 5; i++) {
    const f = fields[i];
    if (f === "*") continue;
    const parts = f.split("/");
    if (parts.length > 2) return `invalid step in field ${i}: ${f}`;
    const rangePart = parts[0];
    const step = parts[1];
    if (step !== undefined && (!/^\d+$/.test(step) || Number(step) < 1)) {
      return `invalid step value in field ${i}: ${step}`;
    }
    const segments = rangePart.split(",");
    for (const seg of segments) {
      if (seg === "*") continue;
      const m = seg.match(/^(\d+)(?:-(\d+))?$/);
      if (!m) return `invalid segment in field ${i}: ${seg}`;
      const lo = Number(m[1]);
      const hi = m[2] !== undefined ? Number(m[2]) : lo;
      const [min, max] = CRON_FIELD_RANGES[i];
      if (lo < min || lo > max || hi < min || hi > max) {
        return `value out of range ${min}-${max} in field ${i}: ${seg}`;
      }
      if (hi < lo) return `range inverted in field ${i}: ${seg}`;
    }
  }
  return null;
}

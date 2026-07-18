import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";

const envPath = resolve(process.cwd(), ".env");
const vercelJsonPath = resolve(process.cwd(), "vercel.json");

const DEFAULT_SCHEDULE = "0 */6 * * *";

function isUrl(str) {
  try {
    const u = new URL(str);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

const CRON_FIELD_RANGES = [
  [0, 59],
  [0, 23],
  [1, 31],
  [1, 12],
  [0, 6],
];

function validateCron(expr) {
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

function parseEnv(file) {
  const vars = {};
  for (const raw of file.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eqIdx = line.indexOf("=");
    if (eqIdx === -1) continue;
    const key = line.slice(0, eqIdx).trim();
    let value = line.slice(eqIdx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    vars[key] = value;
  }
  return vars;
}

if (!existsSync(envPath)) {
  console.error("error: .env not found");
  process.exit(1);
}

const env = parseEnv(readFileSync(envPath, "utf-8"));

const rawUrls = env.CRON_URLS || "";
if (!rawUrls) {
  console.error("error: CRON_URLS not set in .env");
  process.exit(1);
}

const urls = rawUrls
  .split(",")
  .map((u) => u.trim())
  .filter(Boolean);

if (urls.length === 0) {
  console.error("error: CRON_URLS is empty");
  process.exit(1);
}

const invalidUrls = urls.filter((u) => !isUrl(u));
if (invalidUrls.length > 0) {
  console.error(`error: invalid URL(s): ${invalidUrls.join(", ")}`);
  process.exit(1);
}

const schedules = (env.SCHEDULE || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

for (let i = 0; i < schedules.length; i++) {
  const err = validateCron(schedules[i]);
  if (err) {
    console.error(`error: SCHEDULE[${i}] "${schedules[i]}" invalid: ${err}`);
    process.exit(1);
  }
}

if (schedules.length > 0 && schedules.length < urls.length) {
  console.warn(
    `warning: SCHEDULE has ${schedules.length} entries but CRON_URLS has ${urls.length}; ` +
      `missing entries will use default "${DEFAULT_SCHEDULE}"`,
  );
}

const crons = urls.map((url, i) => ({
  path: `/api/cron/${i}`,
  schedule: schedules[i] || DEFAULT_SCHEDULE,
}));

let config = {};
if (existsSync(vercelJsonPath)) {
  try {
    config = JSON.parse(readFileSync(vercelJsonPath, "utf-8"));
  } catch (err) {
    console.error(`error: failed to parse existing vercel.json: ${err.message}`);
    process.exit(1);
  }
}

config.crons = crons;
// maxDuration set via export in app/api/cron/[id]/route.js (Next.js handles function config)

writeFileSync(vercelJsonPath, JSON.stringify(config, null, 2) + "\n");
console.log(`ok: generated vercel.json with ${crons.length} cron job(s)`);

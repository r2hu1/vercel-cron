import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";
import { parseEnv } from "./env.js";
import { isUrl, validateCron } from "./validate.js";

const DEFAULT_SCHEDULE = "0 */6 * * *";

export function loadConfig(cwd) {
  let env = {};

  if (process.env.CRON_URLS) {
    env.CRON_URLS = process.env.CRON_URLS;
    env.SCHEDULE = process.env.SCHEDULE || "";
  } else {
    const envPath = resolve(cwd, ".env");
    if (!existsSync(envPath)) {
      console.error("error: CRON_URLS not set in env and .env not found");
      process.exit(1);
    }
    env = parseEnv(readFileSync(envPath, "utf-8"));
  }

  const rawUrls = env.CRON_URLS || "";
  if (!rawUrls) {
    console.error("error: CRON_URLS not set");
    process.exit(1);
  }

  const urls = rawUrls.split(",").map((u) => u.trim()).filter(Boolean);
  if (urls.length === 0) {
    console.error("error: CRON_URLS is empty");
    process.exit(1);
  }

  const invalidUrls = urls.filter((u) => !isUrl(u));
  if (invalidUrls.length > 0) {
    console.error(`error: invalid URL(s): ${invalidUrls.join(", ")}`);
    process.exit(1);
  }

  const schedules = (env.SCHEDULE || "").split(",").map((s) => s.trim()).filter(Boolean);

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

  return { urls, schedules };
}

export function buildCrons(urls, schedules) {
  return urls.map((url, i) => ({
    path: `/api/cron/${i}`,
    schedule: schedules[i] || DEFAULT_SCHEDULE,
  }));
}

export function writeVercelJson(cwd, crons) {
  const vercelJsonPath = resolve(cwd, "vercel.json");

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
  writeFileSync(vercelJsonPath, JSON.stringify(config, null, 2) + "\n");
  console.log(`ok: generated vercel.json with ${crons.length} cron job(s)`);
}

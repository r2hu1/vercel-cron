import { loadConfig, buildCrons, writeVercelJson } from "../lib/generate.js";

const { urls, schedules } = loadConfig(process.cwd());
const crons = buildCrons(urls, schedules);
writeVercelJson(process.cwd(), crons);

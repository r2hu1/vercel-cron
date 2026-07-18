export const maxDuration = 60;
export const runtime = "nodejs";

const TIMEOUT_MS = 25000;
const MAX_RESPONSE_BODY = 2000;
const MAX_RETRIES = 2;
const RETRY_DELAYS = [1000, 3000];

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function log(level, msg, meta = {}) {
  console.log(JSON.stringify({ time: new Date().toISOString(), level, msg, ...meta }));
}

function isTransient(err) {
  if (err.name === "AbortError") return true;
  if (err.cause?.code === "ECONNRESET" || err.cause?.code === "ETIMEDOUT" || err.cause?.code === "ECONNREFUSED") return true;
  if (err.message?.includes("fetch failed") || err.message?.includes("network")) return true;
  return false;
}

async function doFetch(url, signal) {
  const resp = await fetch(url, { signal, redirect: "follow" });
  const text = await resp.text();
  return {
    status: resp.status,
    ok: resp.ok,
    body: text.slice(0, MAX_RESPONSE_BODY),
    truncated: text.length > MAX_RESPONSE_BODY,
  };
}

async function handler(request, { params }) {
  const reqId = generateId();
  const { id } = params;
  log("info", "cron trigger", { reqId, method: request.method, id });

  if (request.method !== "GET") {
    log("warn", "method not allowed", { reqId, method: request.method });
    return Response.json({ error: "method not allowed" }, { status: 405 });
  }

  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    log("warn", "unauthorized attempt", { reqId });
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const index = parseInt(id, 10);
  if (id === undefined || id === null || isNaN(index) || index < 0 || String(index) !== String(id)) {
    log("warn", "invalid id", { reqId, id });
    return Response.json({ error: `invalid id: ${id}` }, { status: 400 });
  }

  const urlsStr = process.env.CRON_URLS;
  if (!urlsStr) {
    log("error", "CRON_URLS env var not set", { reqId });
    return Response.json({ error: "server misconfigured: CRON_URLS not set" }, { status: 500 });
  }

  const urls = urlsStr.split(",").map((u) => u.trim()).filter(Boolean);
  const targetUrl = urls[index];
  if (!targetUrl) {
    log("warn", "no url for index", { reqId, index, total: urls.length });
    return Response.json({ error: `no URL configured for index ${index}` }, { status: 404 });
  }

  log("info", "fetching", { reqId, index, targetUrl });

  let lastErr = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const delay = RETRY_DELAYS[attempt - 1] || 5000;
      log("warn", "retrying", { reqId, attempt, delay });
      await new Promise((r) => setTimeout(r, delay));
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const result = await doFetch(targetUrl, controller.signal);
      clearTimeout(timeoutId);

      log("info", "response received", {
        reqId, index, status: result.status, ok: result.ok, truncated: result.truncated, attempt,
      });

      return Response.json({
        index, url: targetUrl, status: result.status, ok: result.ok, body: result.body, truncated: result.truncated,
      });
    } catch (err) {
      clearTimeout(timeoutId);
      lastErr = err;
      log("error", "fetch failed", { reqId, index, attempt, error: err.message, name: err.name });
      if (!isTransient(err)) break;
    }
  }

  log("error", "all attempts exhausted", { reqId, index, targetUrl, error: lastErr.message });
  return Response.json(
    { error: `failed to fetch after ${MAX_RETRIES + 1} attempt(s): ${lastErr.message}` },
    { status: 502 },
  );
}

export { handler as GET };

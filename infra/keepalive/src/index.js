// Holds the free Render instance awake. It hibernates after 15 minutes idle and takes ~50s to wake,
// and Render cancels a wake whose client disconnects: a pinger that gives up early never wakes
// anything, which is why the 30s ceiling of cron-job.org and the dropped schedules of GitHub Actions
// both failed here. A Worker waits, because the 10ms free-plan budget is CPU and awaiting a fetch
// spends none of it.

const WAKE_TIMEOUT_MS = 120_000;
const ATTEMPTS = 3;
const RETRY_DELAY_MS = 30_000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const ping = async (url) => {
  // `Accept` must never include text/html: Render answers a request for a hibernating service with
  // a 258 KB "waking up" page instead of holding the connection open.
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(WAKE_TIMEOUT_MS),
  });
  return response.status;
};

export default {
  async scheduled(event, env) {
    for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
      const startedAt = Date.now();
      try {
        const status = await ping(env.HEALTH_URL);
        const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
        console.log(`attempt ${attempt}: HTTP ${status} in ${seconds}s`);
        if (status === 200) return;
      } catch (error) {
        console.log(`attempt ${attempt}: ${error instanceof Error ? error.message : error}`);
      }
      if (attempt < ATTEMPTS) await sleep(RETRY_DELAY_MS);
    }
    // Cloudflare neither retries nor alerts on a failed scheduled run, so the throw exists only to
    // mark the invocation as failed in the Worker's own logs.
    throw new Error('The API did not answer. It is down, or Render refused to route to it.');
  },
};

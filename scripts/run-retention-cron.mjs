const targetUrl = process.env.RETENTION_CRON_URL;
const cronSecret = process.env.CRON_SECRET;

if (!targetUrl || !cronSecret) {
  throw new Error("RETENTION_CRON_URL and CRON_SECRET are required for the external retention scheduler");
}

const response = await fetch(targetUrl, {
  method: "POST",
  headers: { authorization: `Bearer ${cronSecret}` },
});
const body = await response.text();
if (!response.ok) throw new Error(`Retention cleanup failed (${response.status}): ${body}`);
console.log(body);

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  }
});

export default async function handler(request) {
  if (request.method !== "GET") {
    return json({ error: "Method not allowed." }, 405);
  }

  const appId = process.env.ZKTLS_APP_ID;
  const appSecret = process.env.ZKTLS_APP_SECRET;
  if (!appId || !appSecret) {
    return json({
      error: "Primus is not configured for this Netlify site. Add ZKTLS_APP_ID and ZKTLS_APP_SECRET under Site configuration → Environment variables, then redeploy."
    }, 503);
  }

  // The App ID is public; never return the App Secret to the browser.
  return json({ appId });
}

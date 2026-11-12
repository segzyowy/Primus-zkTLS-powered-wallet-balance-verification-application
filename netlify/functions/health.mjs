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

  return json({
    ok: true,
    app: "veriffy",
    primusConfigured: Boolean(process.env.ZKTLS_APP_ID && process.env.ZKTLS_APP_SECRET),
    walletIntegration: false
  });
}

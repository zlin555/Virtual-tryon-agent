// Vercel Serverless Function — catch-all proxy to FastAPI backend
// Adds `ngrok-skip-browser-warning` so ngrok doesn't return its HTML interstitial.

export const config = {
  api: {
    bodyParser: false, // stream raw bytes (required for multipart file uploads)
  },
};

export default async function handler(req, res) {
  const segments = req.query.path || [];
  const path = Array.isArray(segments) ? segments.join('/') : segments;

  const BACKEND =
    process.env.BACKEND_URL ||
    'https://irritate-craving-monopoly.ngrok-free.dev';

  const target = `${BACKEND}/api/${path}`;

  // Forward headers, skipping hop-by-hop headers
  const headers = {};
  const skipHeaders = new Set(['host', 'connection', 'transfer-encoding', 'keep-alive']);
  for (const [key, value] of Object.entries(req.headers)) {
    if (!skipHeaders.has(key.toLowerCase())) {
      headers[key] = value;
    }
  }
  // Tell ngrok to skip the browser warning interstitial
  headers['ngrok-skip-browser-warning'] = 'true';

  const fetchOptions = { method: req.method, headers };

  // Stream request body for POST/PUT/PATCH (handles both JSON and multipart)
  if (!['GET', 'HEAD'].includes(req.method)) {
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    fetchOptions.body = Buffer.concat(chunks);
  }

  try {
    const backendRes = await fetch(target, fetchOptions);

    res.status(backendRes.status);
    const contentType = backendRes.headers.get('content-type');
    if (contentType) res.setHeader('Content-Type', contentType);

    const body = await backendRes.arrayBuffer();
    res.send(Buffer.from(body));
  } catch (err) {
    res.status(502).json({ error: 'Backend unreachable', detail: err.message });
  }
}

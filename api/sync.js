export default async function handler(req, res) {
  // -------------------------------------------------------
  // CORS: Only allow requests from Chrome Extensions
  // -------------------------------------------------------
  const origin = req.headers.origin || '';
  const isExtension = origin.startsWith('chrome-extension://');

  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', isExtension ? origin : '');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, x-proxy-secret'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // -------------------------------------------------------
  // AUTH: Verify shared secret
  // -------------------------------------------------------
  const proxySecret = process.env.PROXY_SECRET;
  const clientSecret = req.headers['x-proxy-secret'];

  if (!proxySecret || clientSecret !== proxySecret) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  // -------------------------------------------------------
  // ENV: Supabase credentials
  // -------------------------------------------------------
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Server misconfiguration: Missing Supabase credentials.' });
  }

  try {
    // =====================================================
    // GET — fetch sync data
    // =====================================================
    if (req.method === 'GET') {
      const { id, select, limit } = req.query;

      let url = `${supabaseUrl}/rest/v1/sync_data`;
      const params = [];
      if (id) params.push(`id=${id}`);
      if (select) params.push(`select=${select}`);
      if (limit) params.push(`limit=${limit}`);

      if (params.length > 0) {
        url += `?${params.join('&')}`;
      }

      const supabaseRes = await fetch(url, {
        method: 'GET',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`
        }
      });

      const data = await supabaseRes.text();
      return res.status(supabaseRes.status).send(data);
    }
    // =====================================================
    // POST — upsert sync data
    // =====================================================
    else if (req.method === 'POST') {
      // --- Input Validation ---
      const body = req.body;

      // 1. Must be an object
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return res.status(400).json({ error: 'Invalid payload format.' });
      }

      // 2. Only allow known fields
      const allowedFields = ['id', 'notepad', 'clipboard', 'updated_at'];
      const receivedFields = Object.keys(body);
      const unknownFields = receivedFields.filter(f => !allowedFields.includes(f));
      if (unknownFields.length > 0) {
        return res.status(400).json({ error: `Unknown fields: ${unknownFields.join(', ')}` });
      }

      // 3. id is required and must be a hex string (SHA-256 hash)
      if (!body.id || typeof body.id !== 'string' || !/^[a-f0-9]{64}$/.test(body.id)) {
        return res.status(400).json({ error: 'Invalid or missing document ID.' });
      }

      // 4. Payload size limit (100 KB)
      const payloadSize = JSON.stringify(body).length;
      if (payloadSize > 102400) {
        return res.status(413).json({ error: 'Payload too large. Max 100 KB.' });
      }

      const url = `${supabaseUrl}/rest/v1/sync_data`;

      const supabaseRes = await fetch(url, {
        method: 'POST',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'resolution=merge-duplicates'
        },
        body: JSON.stringify(body)
      });

      const data = await supabaseRes.text();
      return res.status(supabaseRes.status).send(data);
    }
    // =====================================================
    // Other methods — reject
    // =====================================================
    else {
      return res.status(405).json({ error: 'Method Not Allowed' });
    }
  } catch (error) {
    console.error('Proxy Error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}

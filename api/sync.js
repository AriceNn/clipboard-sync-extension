export default async function handler(req, res) {
  // CORS configuration to allow Chrome Extension to communicate with this endpoint
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*'); // Or restrict to specific origin if needed
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  // Handle OPTIONS method for CORS preflight
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Get environment variables securely provided by Vercel
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Server misconfiguration: Missing Supabase credentials.' });
  }

  try {
    if (req.method === 'GET') {
      const { id, select, limit } = req.query;

      // Construct Supabase URL dynamically based on the request parameters
      let url = `${supabaseUrl}/rest/v1/sync_data`;
      const params = [];
      if (id) params.push(`id=${id}`); // e.g., id=eq.123
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
    else if (req.method === 'POST') {
      const url = `${supabaseUrl}/rest/v1/sync_data`;
      
      const supabaseRes = await fetch(url, {
        method: 'POST',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'resolution=merge-duplicates'
        },
        body: JSON.stringify(req.body)
      });

      const data = await supabaseRes.text();
      return res.status(supabaseRes.status).send(data);
    } 
    else {
      return res.status(405).json({ error: 'Method Not Allowed' });
    }
  } catch (error) {
    console.error('Proxy Error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}

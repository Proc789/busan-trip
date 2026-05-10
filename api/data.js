export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { action, type, day } = req.query;

  // ---- 翻譯功能 ----
  if (action === 'translate') {
    if (req.method !== 'POST') return res.status(405).end();
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: 'Missing text' });

    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 500,
          messages: [{
            role: 'user',
            content: `請將以下中文翻譯成韓文。只回覆韓文翻譯結果，不要任何說明：\n${text}`
          }]
        })
      });
      const data = await r.json();
      const result = data.content?.[0]?.text?.trim() || '';
      return res.status(200).json({ result });
    } catch (e) {
      return res.status(500).json({ error: '翻譯失敗' });
    }
  }

  // ---- 資料庫功能 ----
  const KV_URL = process.env.KV_REST_API_URL;
  const KV_TOKEN = process.env.KV_REST_API_TOKEN;

  async function kvGet(key) {
    const r = await fetch(`${KV_URL}/get/${key}`, {
      headers: { Authorization: `Bearer ${KV_TOKEN}` }
    });
    const json = await r.json();
    return json.result ? JSON.parse(json.result) : [];
  }

  async function kvSet(key, value) {
    await fetch(`${KV_URL}/set/${key}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(JSON.stringify(value))
    });
  }

  if (!type || day === undefined) {
    return res.status(400).json({ error: 'Missing type or day' });
  }

  const key = `busan_${type}_day${day}`;

  if (req.method === 'GET') {
    const data = await kvGet(key);
    return res.status(200).json(data);
  }

  if (req.method === 'POST') {
    const item = req.body;
    const data = await kvGet(key);
    data.push({ ...item, id: Date.now() });
    await kvSet(key, data);
    return res.status(200).json(data);
  }

  if (req.method === 'DELETE') {
    const { id } = req.query;
    const data = await kvGet(key);
    const updated = data.filter(i => String(i.id) !== String(id));
    await kvSet(key, updated);
    return res.status(200).json(updated);
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

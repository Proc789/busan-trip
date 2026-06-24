import { list, put } from '@vercel/blob';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { action, type, day } = req.query;

  // ---- 翻譯功能（免費 MyMemory API）----
  if (action === 'translate') {
    if (req.method !== 'POST') return res.status(405).end();
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: 'Missing text' });
    try {
      const encoded = encodeURIComponent(text);
      const r = await fetch(`https://api.mymemory.translated.net/get?q=${encoded}&langpair=zh-TW|ko`);
      const data = await r.json();
      const result = data.responseData?.translatedText || '';
      return res.status(200).json({ result });
    } catch (e) {
      return res.status(500).json({ error: '翻譯失敗' });
    }
  }

  // ---- 資料庫功能 ----
  const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;

  async function kvGet(key) {
    const { blobs } = await list({ prefix: `data/${key}.json`, token: BLOB_TOKEN });
    if (!blobs.length) return [];
    const r = await fetch(blobs[0].url, { headers: { Authorization: `Bearer ${BLOB_TOKEN}` } });
    return r.ok ? await r.json() : [];
  }

  async function kvSet(key, value) {
    await put(`data/${key}.json`, JSON.stringify(value), { access: 'private', addRandomSuffix: false, contentType: 'application/json', token: BLOB_TOKEN });
  }

  if (!type || (type !== 'favorites' && day === undefined)) {
    return res.status(400).json({ error: 'Missing type or day' });
  }

  const key = type === 'favorites' ? 'busan_favorites' : `busan_${type}_day${day}`;

  try {
  if (req.method === 'GET') return res.status(200).json(await kvGet(key));

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
  } catch (e) { return res.status(500).json({ error: '資料庫暫時無法使用' }); }
}

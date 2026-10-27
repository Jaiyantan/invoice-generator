const express = require('express');
const fs = require('fs/promises');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3333;
const HOST = process.env.HOST || '127.0.0.1';
const DATA_DIR = path.join(__dirname, 'data', 'invoices');

// Invoice numbers like "186/26-27" become safe file names
const slug = (s) => String(s).trim().replace(/[^A-Za-z0-9_-]+/g, '_');

app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const lib = (rel) => (req, res) => res.sendFile(path.join(__dirname, 'node_modules', rel));
app.get('/vendor/html2canvas.js', lib('html2canvas/dist/html2canvas.min.js'));
app.get('/vendor/jspdf.js', lib('jspdf/dist/jspdf.umd.min.js'));

app.get('/api/invoices', async (req, res) => {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const files = (await fs.readdir(DATA_DIR)).filter((f) => f.endsWith('.json'));
  const all = await Promise.all(
    files.map(async (f) => {
      try {
        return JSON.parse(await fs.readFile(path.join(DATA_DIR, f), 'utf8'));
      } catch {
        return null;
      }
    })
  );
  res.json(all.filter(Boolean).sort((a, b) => (b.savedAt || '').localeCompare(a.savedAt || '')));
});

app.post('/api/invoices', async (req, res) => {
  const inv = req.body;
  const no = inv && inv.meta && inv.meta.no;
  if (!no || !String(no).trim()) return res.status(400).json({ error: 'Invoice number is required' });
  const id = slug(no);
  const record = { ...inv, id, savedAt: new Date().toISOString() };
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(path.join(DATA_DIR, id + '.json'), JSON.stringify(record, null, 2));
  res.json({ id, savedAt: record.savedAt });
});

app.delete('/api/invoices/:id', async (req, res) => {
  await fs.rm(path.join(DATA_DIR, slug(req.params.id) + '.json'), { force: true });
  res.json({ ok: true });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message });
});

app.listen(PORT, HOST, () => {
  console.log(`Invoice generator running at http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
});

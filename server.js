const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3333;
const HOST = process.env.HOST || '127.0.0.1';

app.use(express.static(path.join(__dirname, 'public')));

const lib = (rel) => (req, res) => res.sendFile(path.join(__dirname, 'node_modules', rel));
app.get('/vendor/html2canvas.js', lib('html2canvas/dist/html2canvas.min.js'));
app.get('/vendor/jspdf.js', lib('jspdf/dist/jspdf.umd.min.js'));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message });
});

app.listen(PORT, HOST, () => {
  console.log(`Invoice generator running at http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
});

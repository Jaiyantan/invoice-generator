const fs = require('node:fs/promises');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'dist');
const vendor = path.join(output, 'vendor');

async function build() {
  await fs.mkdir(output, { recursive: true });
  await fs.cp(path.join(root, 'public'), output, { recursive: true, force: true });
  await fs.mkdir(vendor, { recursive: true });
  await Promise.all([
    fs.copyFile(
      path.join(root, 'node_modules', 'html2canvas', 'dist', 'html2canvas.min.js'),
      path.join(vendor, 'html2canvas.js')
    ),
    fs.copyFile(
      path.join(root, 'node_modules', 'jspdf', 'dist', 'jspdf.umd.min.js'),
      path.join(vendor, 'jspdf.js')
    ),
  ]);
}

build().catch((error) => {
  console.error('Failed to prepare static deployment files:', error);
  process.exitCode = 1;
});

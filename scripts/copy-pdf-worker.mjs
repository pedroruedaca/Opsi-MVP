// Copies the pdf.js worker into public/ so the browser can load it from a stable URL.
import { copyFile, mkdir } from 'node:fs/promises';
await mkdir('public', { recursive: true });
await copyFile('node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs', 'public/pdf.worker.min.mjs');

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { get, put } from '@vercel/blob';

// Uploaded PDFs go to a private Vercel Blob store when BLOB_READ_WRITE_TOKEN is set,
// otherwise to local disk for development. Files are only ever served through the
// authenticated /api/documents/[id]/file route, never by direct URL.
const LOCAL_PREFIX = 'local:';
const LOCAL_ROOT = path.join(process.cwd(), '.data', 'uploads');

function useBlob(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

export async function storeFile(key: string, bytes: Uint8Array, contentType: string): Promise<string> {
  if (useBlob()) {
    const blob = await put(key, Buffer.from(bytes), { access: 'private', contentType, addRandomSuffix: true });
    return blob.url;
  }
  const target = path.join(LOCAL_ROOT, key);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, bytes);
  return LOCAL_PREFIX + key;
}

export async function readStoredFile(url: string): Promise<Uint8Array | null> {
  if (url.startsWith(LOCAL_PREFIX)) {
    const target = path.resolve(LOCAL_ROOT, url.slice(LOCAL_PREFIX.length));
    if (!target.startsWith(LOCAL_ROOT + path.sep)) return null;
    try { return new Uint8Array(await readFile(target)); } catch { return null; }
  }
  const result = await get(url, { access: 'private' });
  if (!result || result.statusCode !== 200) return null;
  return new Uint8Array(await new Response(result.stream).arrayBuffer());
}

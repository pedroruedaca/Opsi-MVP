import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getDocument } from '@/lib/cases';
import { readStoredFile } from '@/lib/storage';

export const runtime = 'nodejs';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const doc = z.uuid().safeParse(id).success ? await getDocument(id) : null;
  const bytes = doc ? await readStoredFile(doc.blobUrl) : null;
  if (!doc || !bytes) return NextResponse.json({ error: 'Documento no encontrado.' }, { status: 404 });
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${doc.filename.replace(/"/g, '')}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

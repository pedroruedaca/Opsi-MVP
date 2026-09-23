import { after, NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getDocument } from '@/lib/cases';
import { runExtraction } from '@/lib/review';

export const runtime = 'nodejs';
export const maxDuration = 300;

// Starts (or retries) extraction. The work runs after the response; the page polls for the status.
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const doc = z.uuid().safeParse(id).success ? await getDocument(id) : null;
  if (!doc) return NextResponse.json({ error: 'Documento no encontrado.' }, { status: 404 });
  if (doc.extractionStatus === 'needs_review' || doc.extractionStatus === 'confirmed') {
    return NextResponse.json({ error: 'El documento ya se ha extraído.' }, { status: 409 });
  }
  after(() => runExtraction(doc.id));
  return NextResponse.json({ status: 'extracting' }, { status: 202 });
}

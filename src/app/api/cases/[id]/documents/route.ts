import { after, NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { addDocument, getCase } from '@/lib/cases';
import { runExtraction } from '@/lib/review';
import { MAX_UPLOAD_BYTES, UploadValidationError, uploadMetadataSchema } from '@/lib/documents';

export const runtime = 'nodejs';
// Extraction runs after the upload response (see after() below) within this function's lifetime.
export const maxDuration = 300;

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success || !(await getCase(id))) {
    return NextResponse.json({ error: 'Caso no encontrado.' }, { status: 404 });
  }
  const length = Number(request.headers.get('content-length') ?? 0);
  if (length > MAX_UPLOAD_BYTES + 64 * 1024) {
    return NextResponse.json({ error: 'El archivo supera el máximo de 10 MB.' }, { status: 413 });
  }

  let form: FormData;
  try { form = await request.formData(); } catch {
    return NextResponse.json({ error: 'Solicitud no válida.' }, { status: 400 });
  }
  const file = form.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'Falta el archivo.' }, { status: 400 });
  const meta = uploadMetadataSchema.safeParse({ type: form.get('type'), period: form.get('period') ?? '' });
  if (!meta.success) {
    return NextResponse.json({ error: meta.error.issues[0]?.message ?? 'Datos no válidos.' }, { status: 400 });
  }

  try {
    const doc = await addDocument(id, { ...meta.data, filename: file.name, bytes: new Uint8Array(await file.arrayBuffer()) });
    after(() => runExtraction(doc.id));
    return NextResponse.json({ id: doc.id, sha256: doc.sha256 }, { status: 201 });
  } catch (error) {
    if (error instanceof UploadValidationError) return NextResponse.json({ error: error.message }, { status: 400 });
    console.error('Upload failed', error);
    return NextResponse.json({ error: 'No se pudo guardar el archivo. Inténtalo de nuevo.' }, { status: 500 });
  }
}

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { reopenReview } from '@/lib/analysis-runner';
import { ReviewError } from '@/lib/review';

export const runtime = 'nodejs';

const bodySchema = z.object({ reason: z.string().max(1000) });

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return NextResponse.json({ error: 'Caso no encontrado.' }, { status: 404 });
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: 'Solicitud no válida.' }, { status: 400 });
  try {
    await reopenReview(id, body.data.reason);
    return NextResponse.json({ status: 'in_review' });
  } catch (error) {
    if (error instanceof ReviewError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error('Reopen failed', error);
    return NextResponse.json({ error: 'No se pudo reabrir la revisión.' }, { status: 500 });
  }
}

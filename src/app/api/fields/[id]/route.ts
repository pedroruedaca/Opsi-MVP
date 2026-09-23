import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { ReviewError, reviewField } from '@/lib/review';

export const runtime = 'nodejs';

const bodySchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('confirm') }),
  z.object({ action: z.literal('correct'), value: z.string().max(100), reason: z.string().max(1000) }),
  z.object({ action: z.literal('clear'), reason: z.string().max(1000).optional() }),
]);

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return NextResponse.json({ error: 'Campo no encontrado.' }, { status: 404 });
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: 'Solicitud no válida.' }, { status: 400 });
  try {
    const field = await reviewField(id, body.data);
    return NextResponse.json({ id: field.id, status: field.status, confirmedValue: field.confirmedValue });
  } catch (error) {
    if (error instanceof ReviewError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error('Review failed', error);
    return NextResponse.json({ error: 'No se pudo guardar. Inténtalo de nuevo.' }, { status: 500 });
  }
}

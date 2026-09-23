import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { runAnalysis } from '@/lib/analysis-runner';
import { ReviewError } from '@/lib/review';

export const runtime = 'nodejs';

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return NextResponse.json({ error: 'Caso no encontrado.' }, { status: 404 });
  try {
    const row = await runAnalysis(id);
    return NextResponse.json({ id: row.id, recommendation: row.recommendation }, { status: 201 });
  } catch (error) {
    if (error instanceof ReviewError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error('Analysis failed', error);
    return NextResponse.json({ error: 'No se pudo ejecutar el análisis.' }, { status: 500 });
  }
}

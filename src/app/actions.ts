'use server';
import { redirect } from 'next/navigation';
import { createCase } from '@/lib/cases';
import { createCaseSchema } from '@/lib/documents';

export type CreateCaseState = { error: string | null };

export async function createCaseAction(_prev: CreateCaseState, formData: FormData): Promise<CreateCaseState> {
  const parsed = createCaseSchema.safeParse({
    borrowerName: formData.get('borrowerName') ?? '',
    nif: formData.get('nif') ?? '',
    requestedAmount: formData.get('requestedAmount') ?? '',
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos no válidos.' };
  const row = await createCase(parsed.data);
  redirect(`/cases/${row.id}`);
}

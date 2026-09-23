import LoginForm from './LoginForm';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <div className="mx-auto mt-16 max-w-sm rounded-lg border border-line bg-surface p-6">
      <h1 className="text-lg font-semibold">Acceso</h1>
      <p className="mb-5 mt-1 text-sm text-muted">Entorno de demostración de Opsi.</p>
      <LoginForm next={next ?? '/'} />
    </div>
  );
}

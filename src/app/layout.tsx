import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: 'Opsi — Análisis de crédito',
  description: 'De la documentación financiera al memo de crédito, con trazabilidad.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-screen font-sans antialiased">
        <header className="border-b border-line bg-surface">
          <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
            <Link href="/" className="text-base font-semibold tracking-tight text-brand">Opsi</Link>
            <nav className="flex items-center gap-5 text-sm text-muted">
              <Link href="/" className="hover:text-ink">Casos</Link>
              <Link href="/policy" className="hover:text-ink">Política</Link>
              <form action="/logout" method="post"><button className="hover:text-ink">Salir</button></form>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
      </body>
    </html>
  );
}

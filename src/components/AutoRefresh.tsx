'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Re-fetches the server-rendered page while some background work (extraction) is running.
export default function AutoRefresh({ active, intervalMs = 2000 }: { active: boolean; intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(t);
  }, [active, intervalMs, router]);
  return null;
}

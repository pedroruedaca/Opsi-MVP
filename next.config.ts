import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  experimental: {
    // Uploads go through server actions/route handlers; allow the 10 MB PDF limit plus multipart overhead.
    serverActions: { bodySizeLimit: '11mb' },
  },
};

export default nextConfig;

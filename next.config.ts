
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_BUILD_TIME: new Date().toISOString(),
  },
  webpack: (config, { isServer, dev }) => {
    // Workaround for a server chunk resolution issue on some Windows/Node setups where
    // the emitted server runtime tries to require chunks from the server root.
    // Ensure server chunk filenames include the `chunks/` prefix so runtime resolves correctly.
    // Only apply in production builds; in dev this can interfere with Next's vendor-chunk layout.
    if (isServer && !dev && config?.output) {
      config.output.chunkFilename = 'chunks/[id].js';
    }
    return config;
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'images.squarespace-cdn.com',
      },
      {
        protocol: 'https',
        hostname: 'upload.wikimedia.org',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'www.suncatcherstudio.com',
        port: '',
        pathname: '/**',
      }
    ]
  },
  // App Hosting runs `next build`; keep TypeScript strict, but do not fail the
  // whole deploy on ESLint (unused vars / prefer-const). Run `npm run lint -- --quiet`
  // locally (or in CI) to catch Errors before push.
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
};

export default nextConfig;

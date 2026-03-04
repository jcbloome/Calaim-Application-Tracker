
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_BUILD_TIME: new Date().toISOString(),
  },
  webpack: (config, { isServer }) => {
    // Workaround for a server chunk resolution issue on some Windows/Node setups where
    // the emitted server runtime tries to require chunks from the server root.
    // Ensure server chunk filenames include the `chunks/` prefix so runtime resolves correctly.
    if (isServer && config?.output) {
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
  eslint: {
    // Temporarily ignore ESLint errors during builds
    ignoreDuringBuilds: true,
  },
  typescript: {
    // Temporarily ignore TypeScript errors during builds
    ignoreBuildErrors: true,
  },
};

export default nextConfig;

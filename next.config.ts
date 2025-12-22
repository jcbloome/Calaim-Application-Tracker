
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
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
      }
    ]
  },
  experimental: {
    watcherOptions: {
      ignored: [
        '**/.idea/**',
        '**/.vscode/**',
        '**/.git/**',
        '**/.genkit/**',
        '**/lib/genkit/**',
      ],
    },
  },
};

export default nextConfig;

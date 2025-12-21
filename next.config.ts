
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
  webpack: (config) => {
    config.watchOptions.ignored = [
      ...(config.watchOptions.ignored || []),
      '**/.genkit/**',
    ];
    return config;
  }
};

export default nextConfig;

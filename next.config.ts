
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  devIndicators: {
    buildActivity: true,
    buildActivityPosition: 'bottom-right',
  },
  experimental: {
    // This allows the Next.js dev server to accept requests from the
    // Firebase Studio preview URL.
    allowedDevOrigins: ["*.cluster-f4iwdviaqvc2ct6pgytzw4xqy4.cloudworkstations.dev"],
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
      }
    ]
  },
};

export default nextConfig;

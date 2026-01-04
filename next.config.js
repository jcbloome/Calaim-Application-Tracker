/** @type {import('next').NextConfig} */
const nextConfig = {
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
    // Other experimental features can be added here.
  },
  // This is the correct location for allowedDevOrigins
  allowedDevOrigins: [
      '6000-firebase-studio-1763747953373.cluster-f4iwdviaqvc2ct6pgytzw4xqy4.cloudworkstations.dev'
  ]
};

module.exports = nextConfig;

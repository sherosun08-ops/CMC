/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@cmc/ui', '@cmc/core'],
  experimental: {
    optimizePackageImports: ['lucide-react', 'recharts'],
  },
  images: {
    domains: [process.env.NEXT_PUBLIC_S3_DOMAIN || 'localhost'],
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
    ],
  },
};

module.exports = nextConfig;
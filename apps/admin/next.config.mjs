/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@cmc/ui', '@cmc/core'],
  experimental: {
    optimizePackageImports: ['lucide-react'],
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
      { protocol: 'http', hostname: 'localhost' },
    ],
  },
};

export default nextConfig;
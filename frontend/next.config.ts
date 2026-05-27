import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'export',       // static HTML — no Node.js server needed on Hostinger
  basePath: '/watch',     // served at persianatheists.com/watch/
  trailingSlash: true,    // /watch/shorts/ → out/shorts/index.html
  images: {
    unoptimized: true,    // required for static export (no Image Optimization API)
    remotePatterns: [
      { protocol: 'https', hostname: 'i.ytimg.com' },
      { protocol: 'https', hostname: 'img.youtube.com' },
      { protocol: 'https', hostname: 'persianatheists.com' },
      { protocol: 'https', hostname: '*.persianatheists.com' },
    ],
  },
  env: {
    NEXT_PUBLIC_WP_API:   'https://persianatheists.com/wp-json',
    NEXT_PUBLIC_SITE_URL: 'https://persianatheists.com',
  },
};

export default nextConfig;

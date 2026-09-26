/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['better-sqlite3', 'sharp'],
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;

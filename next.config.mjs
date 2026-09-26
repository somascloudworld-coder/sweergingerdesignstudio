/** @type {import('next').NextConfig} */
const nextConfig = {
  // Native modules must stay outside the server bundle and be traced instead.
  serverExternalPackages: ['better-sqlite3', 'sharp'],
};

export default nextConfig;

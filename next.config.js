/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["better-sqlite3"],
  },
  typescript: {
    // ⚠️ Temporarily ignore TypeScript errors during build
    ignoreBuildErrors: true,
  },
  images: {
    // Whitelist external hosts so <Image> can fetch them. Cloudinary is our
    // primary upload target; Unsplash is used for demo / fallback content
    // referenced by the seed data.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
      },
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      {
        protocol: "https",
        hostname: "source.unsplash.com",
      },
    ],
  },
};

module.exports = nextConfig;
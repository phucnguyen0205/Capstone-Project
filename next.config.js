/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["better-sqlite3"],
  },
  typescript: {
    // ⚠️ Temporarily ignore TypeScript errors during build
    ignoreBuildErrors: true,
  },
  // CORS headers cho static assets (fonts, images, JS bundles) để Flutter Web
  // ở http://localhost:8080 có thể load trực tiếp từ Next.js dev server
  // ở http://localhost:3000. Middleware chỉ match /api/* nên không cover
  // các file trong /_next/static/* — phải khai báo ở đây.
  async headers() {
    return [
      {
        // Match tất cả file static mà Next.js serve (font, image, js, css).
        source: "/_next/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET, OPTIONS" },
          {
            key: "Access-Control-Allow-Headers",
            value: "Content-Type, Authorization, Range",
          },
        ],
      },
      {
        // Match file tĩnh khác trong /public (svg, png, v.v.)
        source: "/:path*.{svg,png,jpg,jpeg,gif,webp,ico,woff,woff2,ttf,otf}",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
        ],
      },
    ];
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
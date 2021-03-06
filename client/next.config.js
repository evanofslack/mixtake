/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    images: {
        domains: ["i.scdn.co", "mosaic.scdn.co", "platform-lookaside.fbsbx.com"],
    },
    async rewrites() {
        return [
            {
                source: "/api/:path*",
                destination: "http://localhost:8080/:path*", // Proxy to Backend
            },
        ];
    },
};

module.exports = nextConfig;

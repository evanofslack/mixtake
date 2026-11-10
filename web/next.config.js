const isDev = process.env.NODE_ENV === "development";
// where `next dev` sends /api: `API_URL=http://localhost:8081 npm run dev` when 8080 is taken
const apiUrl = (process.env.API_URL || "http://localhost:8080").replace(/\/+$/, "");

/** @type {import('next').NextConfig} */
module.exports = {
    reactStrictMode: true,
    // don't write web/AGENTS.md on `next dev`; CLAUDE.md points agents at the bundled docs instead
    agentRules: false,
    turbopack: {
        root: __dirname,
    },
    images: {
        unoptimized: true,
    },
    // a static export served by the go binary in production; in dev, proxy the API to `just api`
    // or API_URL (rewrites can't be exported)
    ...(isDev
        ? {
              async rewrites() {
                  return [
                      {
                          source: "/api/:path*",
                          destination: `${apiUrl}/api/:path*`,
                      },
                  ];
              },
          }
        : {
              output: "export",
          }),
};

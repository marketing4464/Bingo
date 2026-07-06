/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      { source: "/", destination: "/host.html" },
      { source: "/favicon.ico", destination: "/assets/on-par-logo.png" },
      { source: "/dashboard", destination: "/dashboard.html" },
      { source: "/host", destination: "/host.html" },
      { source: "/host-guide", destination: "/host-guide.html" },
      { source: "/play", destination: "/play.html" },
      { source: "/display", destination: "/display.html" },
    ];
  },
};

export default nextConfig;

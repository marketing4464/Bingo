/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      { source: "/", destination: "/host.html" },
      { source: "/host", destination: "/host.html" },
      { source: "/play", destination: "/play.html" },
      { source: "/display", destination: "/display.html" },
    ];
  },
};

export default nextConfig;

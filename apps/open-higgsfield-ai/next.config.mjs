/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['studio'],
  // `NEXT_STATIC_EXPORT=1 npm run build` writes a static site to `out/`.
  // The studio runs entirely in the browser (it calls api.kie.ai directly),
  // so it can be hosted on any static host.
  ...(process.env.NEXT_STATIC_EXPORT ? { output: 'export', trailingSlash: true } : {}),
};

export default nextConfig;

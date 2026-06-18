import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    // Per-icon tree-shaking for lucide-react (imported in ~40 files) so a named
    // icon import does not pull the whole icon set into the bundle.
    optimizePackageImports: ['lucide-react'],
  },
}

export default nextConfig

import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    // Per-icon tree-shaking for lucide-react (imported in ~40 files) so a named
    // icon import does not pull the whole icon set into the bundle.
    optimizePackageImports: ['lucide-react'],

    // Client router cache. `dynamic` defaults to 0 in Next 15, which means a
    // date the TM viewed seconds ago is refetched from the server every time
    // they navigate back to it. The schedule route is dynamic (auth cookies),
    // so without this every day-to-day hop is a cold round trip to Supabase.
    //
    // 30s is safe for how Reeve is used: one TM edits a tour, and every
    // mutation already calls revalidatePath, which evicts this cache straight
    // away. The window therefore only ever applies to data nobody has changed.
    staleTimes: {
      dynamic: 30,
      static: 180,
    },
  },
}

export default nextConfig

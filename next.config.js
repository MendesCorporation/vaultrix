/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  experimental: {
    serverComponentsExternalPackages: ['argon2', 'ssh2'],
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
  webpack: (config, { isServer }) => {
    if (isServer && Array.isArray(config.externals)) {
      config.externals.push('ssh2')
    }
    return config
  },
}

module.exports = nextConfig

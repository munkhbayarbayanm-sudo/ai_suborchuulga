import type { NextConfig } from 'next';

const config: NextConfig = {
  transpilePackages: ['@mongolsub/contracts'],
  poweredByHeader: false,
  agentRules: false,
};
export default config;

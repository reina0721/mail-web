import type { NextConfig } from 'next';
const config: NextConfig = { output: 'export', trailingSlash: true, transpilePackages: ['@community-go/ui-adapter','@community-go/design-system','@community-go/state-foundation','@community-go/i18n','@community-go/form-foundation','@community-go/plugin-framework'] };
export default config;

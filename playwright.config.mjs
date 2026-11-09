import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/ui', fullyParallel: true, retries: 0,
  use: { baseURL: 'http://127.0.0.1:4173/wisp/', browserName: 'chromium', trace: 'retain-on-failure' },
  webServer: { command: 'npm run preview -- --port 4173', url: 'http://127.0.0.1:4173/wisp/', reuseExistingServer: !process.env.CI },
});

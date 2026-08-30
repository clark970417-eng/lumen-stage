import { defineConfig, devices } from '@playwright/test'

const baseURL = 'http://127.0.0.1:4173'
const publicLayout = /public-layout\.spec\.ts/
const publicInteractions = /public-interactions\.spec\.ts/
const publicAccessibility = /accessibility-public\.spec\.ts/
const studioAccessibility = /accessibility-studio\.spec\.ts/
const studioFlows = /studio-flows\.spec\.ts/
const webglFallback = /webgl-fallback\.spec\.ts/
const responsiveDesktop = /responsive-desktop\.spec\.ts/
const responsivePhone = /responsive-phone\.spec\.ts/

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  // One worker prevents multiple WebGL studios competing for GPU memory on
  // older laptops and on shared CI runners.
  workers: 1,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    colorScheme: 'dark',
    reducedMotion: 'reduce',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1 --port 4173',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'chromium-desktop',
      testMatch: [publicLayout, publicInteractions, publicAccessibility, studioAccessibility, studioFlows, webglFallback],
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } },
    },
    {
      name: 'webkit-desktop',
      testMatch: [publicLayout, webglFallback],
      use: { ...devices['Desktop Safari'], viewport: { width: 1440, height: 1000 } },
    },
    {
      name: 'chromium-phone',
      testMatch: [publicLayout, publicAccessibility, responsivePhone, webglFallback],
      use: { ...devices['Pixel 7'] },
    },
    {
      name: 'webkit-phone',
      testMatch: [publicLayout, webglFallback],
      use: { ...devices['iPhone 13'] },
    },
    {
      name: 'chromium-ultrawide',
      testMatch: [publicLayout, responsiveDesktop, webglFallback],
      use: { ...devices['Desktop Chrome'], viewport: { width: 2560, height: 1080 } },
    },
    {
      name: 'chromium-tall',
      testMatch: [publicLayout, responsiveDesktop, webglFallback],
      use: { ...devices['Desktop Chrome'], viewport: { width: 1080, height: 1920 } },
    },
    {
      name: 'chromium-short-laptop',
      testMatch: [publicLayout, responsiveDesktop, webglFallback],
      use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 680 } },
    },
  ],
})

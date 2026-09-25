import { defineConfig, minimal2023Preset as preset } from '@vite-pwa/assets-generator/config';

// Maskable and Apple icons are padded; fill the padding with the icon's Critical Red.
const RED = '#dc1a32';

export default defineConfig({
  preset: {
    ...preset,
    maskable: {
      ...preset.maskable,
      resizeOptions: { ...preset.maskable.resizeOptions, background: RED },
    },
    apple: { ...preset.apple, resizeOptions: { ...preset.apple.resizeOptions, background: RED } },
  },
  images: ['public/icon.svg'],
});

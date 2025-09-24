# Hatch OS Favicon and Logo Assets

This directory contains the visual assets for Hatch OS:

## Icons Included:
- `favicon.ico` - 16x16, 32x32, 48x48 favicon for browser tabs
- `logo192.png` - 192x192 app icon for PWA and mobile
- `logo512.png` - 512x512 high-resolution app icon
- `apple-touch-icon.png` - 180x180 Apple touch icon
- `badge.png` - Notification badge icon

## Usage:
These icons are automatically referenced by:
- `public/index.html` for favicon and PWA icons
- `public/manifest.json` for Progressive Web App configuration
- `public/service-worker.js` for push notifications

## Design Guidelines:
- Primary color: #667eea (Hatch OS brand blue)
- Secondary color: #764ba2 (Gradient purple)
- Icon style: Modern, minimal, educational theme
- Symbol: Graduation cap (🎓) representing education

## Generating Icons:
To regenerate icons from source:
1. Create a 512x512 PNG with transparent background
2. Use online tools like favicon.io or realfavicongenerator.net
3. Replace the existing files with new versions
4. Update manifest.json if sizes change

## Browser Support:
- ✅ Chrome/Chromium (Desktop & Android)
- ✅ Firefox (Desktop & Android)  
- ✅ Safari (macOS & iOS)
- ✅ Edge (Desktop & Mobile)
- ✅ PWA installation on all platforms
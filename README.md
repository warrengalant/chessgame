# Chessgame

Modern chess board and UI built with Vite and TypeScript, using the Chessground library (bundled via npm). Focused on smooth animations and great mobile responsiveness.

- Tech: Vite + TypeScript + Chessground
- Animations: 200ms for natural movement
- Mobile: touch-friendly, `touch-action: none`, prevents scroll during drag

## Features
- Clean chessboard with last-move and check highlights
- Premove support
- Configurable orientation and coordinates
- Lightweight, fast startup

## Development
- Dev server: `npm run dev`
- Build: `npm run build`
- Preview build: `npm run preview`

## Notes
- The project bundles Chessground from npm (no CDN) for stability and performance.
- Legal move destinations can be provided by your application as needed.

## License
GPL-3.0-or-later. See `LICENSE` for details.

# Chessgame Micro-Frontend (MFE)

Open-source micro-frontend that embeds the Chessground board and exposes a versioned `postMessage` API for integration from a host application.

- Tech: Vite + TypeScript + Chessground (bundled via npm, no CDN)
- License: GPL-3.0-or-later (required by Chessground)
- Goal: Lichess-level mobile performance, 200ms animations, touch-friendly

## Build & Dev

- Dev: `npm run dev`
- Build: `npm run build`
- Preview: `npm run preview`

## Message Protocol v1
All messages have: `{ type: string, version: 1, id?: string, ts?: number, payload?: any }`

Host → MFE
- `init` `{ options?: { orientation?: 'white'|'black'; coordinates?: boolean; animationMs?: number; blockTouchScroll?: boolean; playerColor?: 'white'|'black'|'both' } }`
- `setPosition` `{ fen: string; lastMove?: { from, to }; check?: boolean; turnColor?: 'white'|'black'; orientation?: 'white'|'black' }`
- `setLegalDests` `{ dests: Array<[from: string, toList: string[]]> }` (serialized Map)
- `setTurn` `{ color: 'white'|'black' }`
- `setDraggable` `{ enabled: boolean; playerColor?: 'white'|'black'|'both' }`
- `clearPremoves` `{}`
- `playPremove` `{}`
- `flip` `{}`
- `setSize` `{ width: number; height: number }`
- `reset` `{}`

MFE → Host
- `hello` `{ version: 1 }` (on load)
- `ready` `{}` (after board init)
- `ack` `{ for: id, ok: boolean, error?: string }`
- `move` `{ from: string, to: string, promotion?: string }`
- `select` `{ square: string | null }`
- `error` `{ message: string, ctx?: any }`

## Security
- The first `init` message locks the allowlisted `origin` of the parent.
- The MFE posts back only to that origin. The host must `postMessage(..., targetOrigin)` explicitly.
- Add CSP `frame-ancestors` on deployment to restrict which hosts can embed this MFE.

## Performance Notes
- `animation.duration = 200` (Chessground default for Lichess-like feel).
- `touch-action: none` on the board container, and `blockTouchScroll: true`.
- Host should provide `movable.dests` each turn (server-prepared) for green dots & tap-to-move.

## License
GPL-3.0-or-later. See `LICENSE`.

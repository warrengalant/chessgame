import { Chessground } from 'chessground';

export type Color = 'white' | 'black';
export type Square = string;

type LegalDests = Array<[Square, Square[]]>;

export type InitOptions = {
  orientation?: Color;
  coordinates?: boolean;
  animationMs?: number;
  blockTouchScroll?: boolean;
  playerColor?: Color | 'both';
};

export type BoardCallbacks = {
  onReady: () => void;
  onMove: (payload: { from: Square; to: Square; promotion?: string }) => void;
  onSelect?: (square: Square | null) => void;
  onError?: (message: string) => void;
};

export class BoardController {
  private el: HTMLElement;
  private cg: any | null = null;
  private callbacks: BoardCallbacks;
  private lastLegalMap: Map<string, string[]> | null = null;
  private lastPremoveMap: Map<string, string[]> | null = null;
  private lastSelectTs: number = 0;

  constructor(el: HTMLElement, callbacks: BoardCallbacks) {
    this.el = el;
    this.callbacks = callbacks;
  }

  init(opts: InitOptions = {}) {
    if (this.cg) return;
    const animationMs = typeof opts.animationMs === 'number' ? opts.animationMs : 200;
    try {
      this.cg = Chessground(this.el, {
        orientation: opts.orientation || 'white',
        coordinates: opts.coordinates !== false,
        animation: { enabled: true, duration: animationMs },
        blockTouchScroll: opts.blockTouchScroll !== false,
        draggable: { enabled: true, distance: 0, autoDistance: true, showGhost: true },
        selectable: { enabled: true },
        movable: { color: opts.playerColor || 'both', free: false, showDests: true },
        premovable: { enabled: true, showDests: true, castle: true },
        highlight: { lastMove: true, check: true },
        events: {
          move: (orig: Square, dest: Square) => {
            this.callbacks.onMove({ from: orig, to: dest });
            // Clear any highlights after a successful move
            this.cg.set({ movable: { dests: undefined, showDests: true } });
            this.cg.set({ premovable: { dests: undefined, showDests: true } });
            this.lastLegalMap = null;
            this.lastPremoveMap = null;
          },
          select: (key?: string) => {
            if (!this.callbacks.onSelect) return;
            if (key) {
              this.lastSelectTs = Date.now();
              this.callbacks.onSelect(key);
            } else {
              // Ignore immediate deselects right after a select to prevent flicker
              if (Date.now() - this.lastSelectTs < 200) return;
              this.callbacks.onSelect(null);
              // Clear dots locally on user deselect
              this.cg.set({ movable: { dests: undefined, showDests: true } });
              this.cg.set({ premovable: { dests: undefined, showDests: true } });
              this.lastLegalMap = null;
              this.lastPremoveMap = null;
            }
          },
        },
      });
      this.callbacks.onReady();
    } catch (e: any) {
      if (this.callbacks.onError) this.callbacks.onError(e?.message || 'init failed');
    }
  }

  setPosition(payload: { fen: string; lastMove?: { from: Square; to: Square }; check?: boolean; turnColor?: Color; orientation?: Color }) {
    if (!this.cg) return;
    const update: any = {
      fen: payload.fen,
      ...(payload.lastMove ? { lastMove: [payload.lastMove.from, payload.lastMove.to] } : {}),
      ...(typeof payload.check === 'boolean' ? { check: payload.check } : {}),
      ...(payload.turnColor ? { turnColor: payload.turnColor } : {}),
      ...(payload.orientation ? { orientation: payload.orientation } : {}),
    };
    this.cg.set(update);
    // Reapply last known dots to avoid clearing by set()
    if (this.lastLegalMap) this.cg.set({ movable: { dests: this.lastLegalMap, showDests: true } });
    if (this.lastPremoveMap) this.cg.set({ premovable: { dests: this.lastPremoveMap, showDests: true } });
  }

  setLegalDests(dests: LegalDests) {
    if (!this.cg) return;
    if (!dests || dests.length === 0) return; // Ignore empty clears; persist dots
    // Filter out destinations that are currently occupied by a same-color piece in cg state
    const filtered = new Map<string, string[]>();
    const pieces: Map<string, any> | undefined = (this.cg as any)?.state?.pieces;
    for (const [orig, tos] of dests) {
      const originPiece = pieces?.get(orig);
      const clean = tos.filter(to => {
        const destPiece = pieces?.get(to);
        return !destPiece || !originPiece || destPiece.color !== originPiece.color;
      });
      if (clean.length > 0) filtered.set(orig, clean);
    }
    this.cg.set({ movable: { dests: filtered, showDests: true } });
    // Ensure premove dots are not shown concurrently
    this.cg.set({ premovable: { dests: undefined, showDests: true } });
    this.lastLegalMap = filtered;
    // timestamp no longer used
    this.lastPremoveMap = null;
  }

  setTurn(color: Color) {
    if (!this.cg) return;
    this.cg.set({ turnColor: color });
  }

  setDraggable(enabled: boolean, playerColor: Color | 'both' = 'both') {
    if (!this.cg) return;
    this.cg.set({ draggable: { enabled }, movable: { color: playerColor } });
    // Reapply dots after state changes
    if (this.lastLegalMap) this.cg.set({ movable: { dests: this.lastLegalMap, showDests: true } });
    if (this.lastPremoveMap) this.cg.set({ premovable: { dests: this.lastPremoveMap, showDests: true } });
  }

  setFreeMode(free: boolean) {
    if (!this.cg) return;
    this.cg.set({ movable: { free } });
    if (this.lastLegalMap) this.cg.set({ movable: { dests: this.lastLegalMap, showDests: true } });
    if (this.lastPremoveMap) this.cg.set({ premovable: { dests: this.lastPremoveMap, showDests: true } });
  }

  setPremoveDests(dests: Array<[Square, Square[]]>) {
    if (!this.cg) return;
    if (!dests || dests.length === 0) return; // Ignore empty clears; persist dots
    const map = new Map<string, string[]>(dests);
    this.cg.set({ premovable: { dests: map, showDests: true } });
    // Ensure legal dots are not shown concurrently
    this.cg.set({ movable: { dests: undefined, showDests: true } });
    this.lastPremoveMap = map;
    // timestamp no longer used
    this.lastLegalMap = null;
  }

  clearPremoves() {
    if (!this.cg) return;
    this.cg.set({ premovable: { enabled: false } });
    this.cg.set({ premovable: { enabled: true } });
  }

  playPremove() {
    if (!this.cg) return;
    if (this.cg.playPremove) this.cg.playPremove();
  }

  flip() {
    if (!this.cg) return;
    const cur = this.cg.state?.orientation || 'white';
    this.cg.set({ orientation: cur === 'white' ? 'black' : 'white' });
  }

  setSize(width: number, height: number) {
    if (width && width > 0) {
      this.el.style.width = `${width}px`;
    } else {
      // Let CSS decide (100%/aspect-ratio)
      this.el.style.removeProperty('width');
    }
    if (height && height > 0) {
      this.el.style.height = `${height}px`;
    } else {
      this.el.style.removeProperty('height');
    }
  }

  destroy() {
    if (!this.cg) return;
    try {
      if (this.cg.stop) this.cg.stop();
      if (this.cg.cancelMove) this.cg.cancelMove();
      this.cg.set({ animation: { enabled: false, duration: 0 } });
      if (this.cg.destroy) this.cg.destroy();
    } finally {
      this.cg = null;
    }
  }
}

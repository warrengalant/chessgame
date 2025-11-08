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
  private lastLegalSetTs: number = 0;
  private lastPremoveSetTs: number = 0;

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
        draggable: { enabled: true, distance: 3, autoDistance: true, showGhost: true },
        movable: { color: opts.playerColor || 'both', free: true, showDests: true },
        premovable: { enabled: true, showDests: true, castle: true },
        highlight: { lastMove: true, check: true },
        events: {
          move: (orig: Square, dest: Square) => {
            this.callbacks.onMove({ from: orig, to: dest });
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
              this.cg.set({ premovable: { customDests: undefined, showDests: true } });
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
    if (this.lastPremoveMap) this.cg.set({ premovable: { customDests: this.lastPremoveMap, showDests: true } });
  }

  setLegalDests(dests: LegalDests) {
    if (!this.cg) return;
    if (!dests || dests.length === 0) {
      // Avoid flicker: ignore clears arriving immediately after a set
      if (Date.now() - this.lastLegalSetTs < 200) return;
      // Clear to restore default behavior (no restriction)
      this.cg.set({ movable: { dests: undefined, showDests: true } });
      this.lastLegalMap = null;
      return;
    }
    const map = new Map<string, string[]>(dests);
    this.cg.set({ movable: { dests: map, showDests: true } });
    // Ensure premove dots are not shown concurrently
    this.cg.set({ premovable: { customDests: undefined, showDests: true } });
    this.lastLegalMap = map;
    this.lastLegalSetTs = Date.now();
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
    if (this.lastPremoveMap) this.cg.set({ premovable: { customDests: this.lastPremoveMap, showDests: true } });
  }

  setFreeMode(free: boolean) {
    if (!this.cg) return;
    this.cg.set({ movable: { free } });
    if (this.lastLegalMap) this.cg.set({ movable: { dests: this.lastLegalMap, showDests: true } });
    if (this.lastPremoveMap) this.cg.set({ premovable: { customDests: this.lastPremoveMap, showDests: true } });
  }

  setPremoveDests(dests: Array<[Square, Square[]]>) {
    if (!this.cg) return;
    if (!dests || dests.length === 0) {
      if (Date.now() - this.lastPremoveSetTs < 200) return;
      this.cg.set({ premovable: { customDests: undefined, showDests: true } });
      this.lastPremoveMap = null;
      return;
    }
    const map = new Map<string, string[]>(dests);
    this.cg.set({ premovable: { customDests: map, showDests: true } });
    // Ensure legal dots are not shown concurrently
    this.cg.set({ movable: { dests: undefined, showDests: true } });
    this.lastPremoveMap = map;
    this.lastPremoveSetTs = Date.now();
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

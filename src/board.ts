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
        movable: { color: opts.playerColor || 'both', free: false, showDests: true },
        premovable: { enabled: true, showDests: true, castle: true },
        highlight: { lastMove: true, check: true },
        events: {
          move: (orig: Square, dest: Square) => {
            this.callbacks.onMove({ from: orig, to: dest });
          },
          select: (key?: string) => {
            if (!this.callbacks.onSelect) return;
            this.callbacks.onSelect(key || null);
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
  }

  setLegalDests(dests: LegalDests) {
    if (!this.cg) return;
    const map = new Map<string, string[]>(dests);
    this.cg.set({ movable: { dests: map, showDests: true, free: false } });
  }

  setTurn(color: Color) {
    if (!this.cg) return;
    this.cg.set({ turnColor: color });
  }

  setDraggable(enabled: boolean, playerColor: Color | 'both' = 'both') {
    if (!this.cg) return;
    this.cg.set({ draggable: { enabled }, movable: { color: playerColor } });
  }

  setFreeMode(free: boolean) {
    if (!this.cg) return;
    this.cg.set({ movable: { free } });
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

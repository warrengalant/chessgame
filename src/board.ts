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
  onPremoveSelect?: (payload: { from: Square; to: Square }) => void;
};

export class BoardController {
  private el: HTMLElement;
  private cg: any | null = null;
  private callbacks: BoardCallbacks;
  private lastLegalMap: Map<string, string[]> | null = null;
  private lastPremoveMap: Map<string, string[]> | null = null;
  private lastSelectTs: number = 0;
  private lastSelectedKey: string | null = null;
  private suppressNextSelectEvent: boolean = false;
  // Save/restore current premove highlight between previews
  private savedPremCurrent: [Square, Square] | null = null;
  // Only these actions may clear a premove: right-click, clicking/dragging premove origin
  private allowPremoveClear: boolean = false;

  private debugReport(tag: string) {
    try {
      const root = this.el as HTMLElement;
      const doc = root.ownerDocument || document;
      const count = (sel: string) => doc.querySelectorAll(`#${root.id} ${sel}, ${sel}`).length;
      const moveDots = count('cg-square.move-dest, square.move-dest, .move-dest');
      const moveRings = count('cg-square.move-dest.oc, square.move-dest.oc, .move-dest.oc, cg-square.move-dest.occupied, square.move-dest.occupied, .move-dest.occupied');
      const premoveDots = count('cg-square.premove-dest, square.premove-dest, .premove-dest');
      const premoveRings = count('cg-square.premove-dest.oc, square.premove-dest.oc, .premove-dest.oc, cg-square.premove-dest.occupied, square.premove-dest.occupied, .premove-dest.occupied');
      const lastMove = count('cg-square.last-move, square.last-move, .last-move');
      const check = count('cg-square.check, square.check, .check');
      const pieces = count('piece, cg-piece');
      const bishops = doc.querySelector(`#${root.id} piece.bishop.white, #${root.id} cg-piece.bishop.white, piece.bishop.white, cg-piece.bishop.white`) as HTMLElement | null;
      const bg = bishops ? (root.ownerDocument.defaultView || window).getComputedStyle(bishops).backgroundImage : 'n/a';
      const m = (this.cg as any)?.state?.movable;
      const p = (this.cg as any)?.state?.premovable;
      const selectedSquare = (this.cg as any)?.state?.selected || null;
      const selectedDestsLen = m?.dests && selectedSquare && typeof m.dests.get === 'function' ? (m.dests.get(selectedSquare)?.length || 0) : 0;
      const selectedCount = count('cg-square.selected, square.selected, .selected');
      // Inspect first move-dest square computed styles for diagnostics
      const mdEl = doc.querySelector(
        `#${root.id} cg-board square.move-dest, #${root.id} square.move-dest, cg-board square.move-dest, square.move-dest`
      ) as HTMLElement | null;
      if (mdEl) {
        const cs = (root.ownerDocument.defaultView || window).getComputedStyle(mdEl);
        try {
          console.log('[MFE DBG] moveDest CSS | display=', cs.display, 'vis=', cs.visibility, 'opacity=', cs.opacity, 'pos=', cs.position, 'z=', cs.zIndex, 'bg=', cs.background, 'bgImg=', cs.backgroundImage);
        } catch {}
        // Do not mutate styles in production; outlines caused visible artifacts
      }
      // Summarize
      console.log(`[MFE DBG] ${tag} | pieces=${pieces} moveDots=${moveDots}/${moveRings} premove=${p?.showDests ? 'on' : 'off'} dots=${premoveDots}/${premoveRings} last=${lastMove} check=${check} selected=${selectedSquare || 'none'} selCount=${selectedCount} selDests=${selectedDestsLen} | movable.showDests=${m?.showDests} dests=${m?.dests ? (m.dests.size || 0) : 0}`);
      console.log(`[MFE DBG] ${tag} | bishop.white background-image:`, bg);
    } catch (e) {
      console.warn('[MFE DBG] debugReport error', e);
    }
  }

  constructor(el: HTMLElement, callbacks: BoardCallbacks) {
    this.el = el;
    this.callbacks = callbacks;
    // Right-click anywhere on the board clears the premove (one of the allowed ways)
    try {
      this.el.addEventListener('contextmenu', (e) => {
        try { e.preventDefault(); } catch {}
        try {
          this.allowPremoveClear = true;
          const st: any = (this.cg as any)?.state;
          const cur: [Square, Square] | undefined = st?.premovable?.current;
          if (cur) {
            (this.cg as any).set({ premovable: { current: undefined, showDests: true } });
          }
          // Also clear any premove dots
          (this.cg as any)?.set({ premovable: { customDests: new Map(), showDests: true } });
        } catch {}
        this.savedPremCurrent = null;
        this.lastPremoveMap = null;
      }, { passive: false });
    } catch {}
    // Click/drag on the premove ORIGIN square clears premove (allowed ways #1 and #2)
    try {
      this.el.addEventListener('pointerdown', (e: any) => {
        try {
          const target = e.target as HTMLElement | null;
          if (!target) return;
          const sqEl = target.closest('cg-square[data-key], square[data-key]') as HTMLElement | null;
          if (!sqEl) return;
          const key = (sqEl.getAttribute('data-key') || '') as Square;
          const locked = this.savedPremCurrent as [Square, Square] | null;
          if (locked && key && key === locked[0]) {
            this.allowPremoveClear = true;
            (this.cg as any)?.set({ premovable: { current: undefined, showDests: true } });
            (this.cg as any)?.set({ premovable: { customDests: new Map(), showDests: true } });
            this.savedPremCurrent = null;
            this.lastPremoveMap = null;
          }
        } catch {}
      }, { passive: true });
    } catch {}
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
        draggable: { 
          enabled: true, distance: 0, autoDistance: true, showGhost: true,
        } as any,
        selectable: { enabled: true },
        movable: { color: opts.playerColor || 'both', free: false, showDests: true },
        premovable: { 
          enabled: true, 
          showDests: true, 
          castle: true,
          additionalPremoveRequirements: () => false,
          events: {
            set: (orig: Square, dest: Square) => {
              // If a premove already exists, REJECT replacement: restore the original and deselect
              try {
                const st: any = (this.cg as any)?.state;
                const current: [Square, Square] | undefined = st?.premovable?.current;
                const locked = this.savedPremCurrent;
                const hasExisting = !!(locked && locked[0] && locked[1]);
                if (hasExisting && (!current || current[0] !== locked[0] || current[1] !== locked[1])) {
                  // Restore the locked premove and clear the transient selection
                  (this.cg as any).set({ premovable: { current: locked, showDests: true } });
                  (this.cg as any).set({ selected: undefined });
                  // Do NOT propagate a new premove selection
                  return;
                }
              } catch {}
              // First-time premove: accept and lock it
              try { console.log('[MFE DBG] premoveSelect event from Chessground', orig, '→', dest); } catch {}
              this.savedPremCurrent = [orig, dest];
              if (this.callbacks.onPremoveSelect) {
                this.callbacks.onPremoveSelect({ from: orig, to: dest });
              }
            },
            unset: () => {
              // Only clear if we explicitly allowed it (click/drag on origin or right-click)
              if (this.allowPremoveClear) {
                this.allowPremoveClear = false;
                this.savedPremCurrent = null;
                try {
                  (this.cg as any).set({ premovable: { customDests: new Map(), showDests: true } });
                } catch {}
              } else {
                // Not allowed: immediately restore the locked premove
                const locked = this.savedPremCurrent as [Square, Square] | null;
                if (locked && locked[0] && locked[1]) {
                  try { (this.cg as any).set({ premovable: { current: locked, showDests: true } }); } catch {}
                }
              }
            }
          }
        } as any,
        highlight: { lastMove: true, check: true },
        events: {
          move: (orig: Square, dest: Square) => {
            this.callbacks.onMove({ from: orig, to: dest });
            // Clear any highlights after a successful move
            this.cg.set({ movable: { dests: undefined, showDests: true } });
            this.cg.set({ premovable: { customDests: undefined, showDests: true } });
            try { this.cg.set({ selected: undefined }); } catch {}
            this.lastSelectedKey = null;
            this.lastLegalMap = null;
            this.lastPremoveMap = null;
          },
          select: (key?: string) => {
            if (!this.callbacks.onSelect) return;
            if (key) {
              if (this.suppressNextSelectEvent) {
                try { console.log('[MFE DBG] select suppressed by suppressNextSelectEvent for', key); } catch {}
                this.suppressNextSelectEvent = false;
                return;
              }
              try { console.log('[MFE DBG] select', key); } catch {}
              this.lastSelectTs = Date.now();
              this.lastSelectedKey = key;
              // Keep existing premove visible while previewing another piece
              try {
                const locked = this.savedPremCurrent as [Square, Square] | null;
                if (locked && locked[0] && locked[1]) {
                  (this.cg as any).set({ premovable: { current: locked, showDests: true } });
                } else {
                  const cur = (this.cg as any)?.state?.premovable?.current as [Square, Square] | undefined;
                  if (cur) this.savedPremCurrent = [cur[0], cur[1]];
                }
              } catch {}
              this.callbacks.onSelect(key);
            } else {
              // Ignore immediate deselects right after a select to prevent flicker
              if (Date.now() - this.lastSelectTs < 200) return;
              try { console.log('[MFE DBG] deselect'); } catch {}
              this.callbacks.onSelect(null);
              // Clear dots locally on user deselect
              this.cg.set({ movable: { dests: undefined, showDests: true } });
              this.cg.set({ premovable: { customDests: new Map(), showDests: true } });
              this.lastLegalMap = null;
              this.lastPremoveMap = null;
              this.lastSelectedKey = null;
              // Restore previously hidden premove current highlight
              if (this.savedPremCurrent) {
                try { (this.cg as any).set({ premovable: { current: this.savedPremCurrent, showDests: true } }); } catch {}
                // Keep the lock; only drag/right-click/unset should clear it
              }
            }
          },
        },
      });
      this.callbacks.onReady();
      // Post-init snapshot for diagnostics
      setTimeout(() => this.debugReport('init'), 50);
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
    try {
      const st: any = (this.cg as any)?.state;
      const movableColor = st?.movable?.color;
      const isPlayersTurn = movableColor && movableColor !== 'both' && st?.turnColor === movableColor;
      if (isPlayersTurn) {
        if (this.lastLegalMap) this.cg.set({ movable: { dests: this.lastLegalMap, showDests: true } });
        this.cg.set({ premovable: { customDests: new Map(), showDests: true } });
        this.lastPremoveMap = null;
      } else {
        this.cg.set({ movable: { dests: undefined, showDests: true } });
        if (this.lastPremoveMap) this.cg.set({ premovable: { customDests: this.lastPremoveMap, showDests: true } });
      }
    } catch {}
    try {
      const st: any = (this.cg as any)?.state;
      const movableColor = st?.movable?.color;
      const isPlayersTurn = movableColor && movableColor !== 'both' && st?.turnColor === movableColor;
      const recentUserSelect = Date.now() - this.lastSelectTs <= 800;
      if (this.lastSelectedKey && isPlayersTurn && recentUserSelect) {
        this.cg.set({ selected: this.lastSelectedKey });
      } else {
        this.cg.set({ selected: undefined });
      }
    } catch {}
    // Ensure premove current persists across position updates
    try {
      if (this.savedPremCurrent) {
        this.cg.set({ premovable: { current: this.savedPremCurrent, showDests: true } });
      }
    } catch {}
    // Snapshot after DOM settles
    setTimeout(() => this.debugReport('setPosition'), 10);
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
    // Clear premove dots when setting legal dots (your turn)
    this.cg.set({ premovable: { customDests: new Map(), showDests: true } });
    this.lastLegalMap = filtered;
    this.lastPremoveMap = null;
    console.log('[MFE DBG] setLegalDests applied entries=', filtered.size);
    setTimeout(() => this.debugReport('setLegalDests'), 10);
  }

  setTurn(color: Color) {
    if (!this.cg) return;
    this.cg.set({ turnColor: color });
    try {
      const st: any = (this.cg as any)?.state;
      const movableColor = st?.movable?.color;
      const isPlayersTurn = movableColor && movableColor !== 'both' && st?.turnColor === movableColor;
      if (isPlayersTurn) {
        if (this.lastLegalMap) this.cg.set({ movable: { dests: this.lastLegalMap, showDests: true } });
        this.cg.set({ premovable: { customDests: new Map(), showDests: true } });
        this.lastPremoveMap = null;
      } else {
        this.cg.set({ movable: { dests: undefined, showDests: true } });
        if (this.lastPremoveMap) this.cg.set({ premovable: { customDests: this.lastPremoveMap, showDests: true } });
      }
    } catch {}
    // Re-apply locked premove current after turn changes
    try {
      if (this.savedPremCurrent) {
        this.cg.set({ premovable: { current: this.savedPremCurrent, showDests: true } });
      }
    } catch {}
  }

  setDraggable(enabled: boolean, playerColor: Color | 'both' = 'both') {
    if (!this.cg) return;
    this.cg.set({ draggable: { enabled }, movable: { color: playerColor } });
    try {
      const st: any = (this.cg as any)?.state;
      const movableColor = st?.movable?.color;
      const isPlayersTurn = movableColor && movableColor !== 'both' && st?.turnColor === movableColor;
      if (isPlayersTurn) {
        if (this.lastLegalMap) this.cg.set({ movable: { dests: this.lastLegalMap, showDests: true } });
        this.cg.set({ premovable: { customDests: new Map(), showDests: true } });
        this.lastPremoveMap = null;
      } else {
        this.cg.set({ movable: { dests: undefined, showDests: true } });
        if (this.lastPremoveMap) this.cg.set({ premovable: { customDests: this.lastPremoveMap, showDests: true } });
      }
    } catch {}
  }

  setFreeMode(free: boolean) {
    if (!this.cg) return;
    this.cg.set({ movable: { free } });
    if (this.lastLegalMap) this.cg.set({ movable: { dests: this.lastLegalMap, showDests: true } });
    if (this.lastPremoveMap) this.cg.set({ premovable: { customDests: this.lastPremoveMap, showDests: true } });
  }

  setPremoveDests(dests: Array<[Square, Square[]]>) {
    if (!this.cg) return;
    try {
      const st: any = (this.cg as any)?.state;
      const movableColor = st?.movable?.color;
      const isPlayersTurn = movableColor && movableColor !== 'both' && st?.turnColor === movableColor;
      if (isPlayersTurn) {
        try { console.log('[MFE DBG] setPremoveDests ignored: player\'s turn. Clearing customDests.'); } catch {}
        this.cg.set({ premovable: { customDests: new Map(), showDests: true } });
        this.lastPremoveMap = null;
        return;
      }
    } catch {}
    
    if (!dests || dests.length === 0) {
      // Clear premove dots if no destinations
      this.cg.set({ premovable: { customDests: new Map(), showDests: true } });
      this.lastPremoveMap = null;
      return;
    }
    
    const map = new Map<string, string[]>(dests);
    console.log('[MFE DBG] setPremoveDests setting map:', Array.from(map.entries()));
    
    // Log which squares have pieces for debugging anticipation highlights
    const pieces = (this.cg as any)?.state?.pieces;
    if (pieces) {
      for (const [from, tos] of map.entries()) {
        const occupied = tos.filter(to => pieces.has(to));
        if (occupied.length > 0) {
          console.log(`[MFE DBG] Premove from ${from} includes occupied squares:`, occupied.map(sq => {
            const p = pieces.get(sq);
            return `${sq}(${p?.color} ${p?.role})`;
          }));
        }
      }
    }
    
    // Clear legal move dots before showing premove dots to avoid overlap
    this.cg.set({ movable: { dests: undefined, showDests: true } });
    this.lastLegalMap = null;

    // Use customDests for our premove destinations
    this.cg.set({ premovable: { enabled: true, showDests: true, customDests: map } });
    this.lastPremoveMap = map;
    console.log('[MFE DBG] setPremoveDests applied entries=', map.size);
    setTimeout(() => this.debugReport('setPremoveDests'), 10);
  }

  // Clear the premovable dests map while keeping premoves enabled and showDests on
  clearPremoveDestsMap() {
    if (!this.cg) return;
    try {
      console.log('[MFE] Clearing premove dots');
      // CRITICAL: Clear customDests, not dests
      this.cg.set({ premovable: { customDests: new Map(), showDests: true } });
      this.lastPremoveMap = null;
    } catch (e) {
      console.error('[MFE] Error clearing premove dots', e);
    }
    setTimeout(() => this.debugReport('clearPremoveDests'), 10);
  }

  // Show a persistent highlight that a premove has been set (origin/destination)
  setPremoveCurrent(from: Square, to: Square) {
    if (!this.cg) return;
    try {
      const cur: [Square, Square] = [from, to];
      (this.cg as any).set({ premovable: { current: cur, showDests: true } });
      this.savedPremCurrent = cur; // Keep in sync so we can restore across previews
      // Do not clear existing dest maps; just add current highlight
      this.lastSelectedKey = null;
      setTimeout(() => this.debugReport('setPremoveCurrent'), 10);
    } catch (e) {
      try { console.warn('[MFE DBG] setPremoveCurrent error', e); } catch {}
    }
  }

  setSelected(square: Square | null) {
    if (!this.cg) return;
    if (square) {
      this.lastSelectedKey = square;
      this.suppressNextSelectEvent = true;
      this.cg.set({ selected: square });
    } else {
      this.lastSelectedKey = null;
      // Do not suppress next user select on programmatic deselect; allow first click to register
      this.cg.set({ selected: undefined });
    }
    setTimeout(() => this.debugReport('setSelected'), 10);
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

import 'chessground/assets/chessground.base.css';
import 'chessground/assets/chessground.cburnett.css';
import './style.css';
import { BoardController, type InitOptions } from './board';

// Message protocol v1
// All messages: { type: string, version: 1, id?: string, ts?: number, payload?: any }

const VERSION = 1;

// Allowlist handling
let allowedOrigin: string | '*' = '*';
let parentWindow: Window | null = null;

// Board
let controller: BoardController | null = null;
let initializedByParent = false;
let customStyleEl: HTMLStyleElement | null = null;
let boardThemeStyleEl: HTMLStyleElement | null = null;

function applyTheme(name?: string) {
  const body = document.body;
  // Keep pc30 piece theme sticky unless explicitly disabled in the future
  if (name === 'pc30') body.classList.add('theme-pc30');

  // Map site theme names to light/dark/border/pattern
  const themeMap: Record<string, { light: string; dark: string; border?: string; pattern?: string }> = {
    blue: {
      name: 'Blue',
      light: '#CCE5FF',
      dark: '#336699',
      border: '#224466',
      pattern: `repeating-linear-gradient(135deg, rgba(255,255,255,0.04) 0px, rgba(0,0,0,0.04) 20px)`,
    } as any,
    emerald: {
      name: 'Emerald',
      light: '#D9EAD3',
      dark: '#38761D',
      border: '#1A330F',
      pattern: `repeating-linear-gradient(135deg, rgba(255,255,255,0.04) 0px, rgba(0,50,0,0.05) 25px)`,
    } as any,
    slate: {
      name: 'Slate',
      light: '#CBD5E1',
      dark: '#475569',
      border: '#1E293B',
      pattern: `repeating-linear-gradient(90deg, rgba(255,255,255,0.03) 0px, rgba(0,0,0,0.05) 25px)`,
    } as any,
    purple: {
      name: 'Purple',
      light: '#EEE6FF',
      dark: '#5E3A8A',
      border: '#3A1E54',
      pattern: `repeating-linear-gradient(120deg, rgba(255,255,255,0.05) 0px, rgba(0,0,0,0.05) 25px)`,
    } as any,
    cherry: {
      name: 'Cherry Wood',
      light: '#D29A7C',
      dark: '#7C3F26',
      border: '#52281A',
      pattern: `repeating-linear-gradient(135deg, rgba(190,70,40,0.15) 0px, rgba(120,30,10,0.1) 15px, rgba(190,70,40,0.15) 30px)`,
    } as any,
    mahogany: {
      name: 'Mahogany Wood',
      light: '#B87A5B',
      dark: '#4B1E0F',
      border: '#2C120A',
      pattern: `repeating-linear-gradient(120deg, rgba(110,40,30,0.2) 0px, rgba(60,20,15,0.15) 15px, rgba(110,40,30,0.2) 30px)`,
    } as any,
    maple: {
      name: 'Maple Wood',
      light: '#F5E1C8',
      dark: '#C59A72',
      border: '#8B6C4B',
      pattern: `repeating-linear-gradient(90deg, rgba(255,230,190,0.25) 0px, rgba(200,160,120,0.15) 15px, rgba(255,230,190,0.25) 30px)`,
    } as any,
    grey: {
      name: 'Grey',
      light: '#DADADA',
      dark: '#707070',
      border: '#333333',
      pattern: `repeating-linear-gradient(135deg, rgba(255,255,255,0.04) 0px, rgba(0,0,0,0.05) 20px)`,
    } as any,
  };

  // Inject CSS for cg-board background if known theme
  const pair = name ? themeMap[name] : undefined;
  if (boardThemeStyleEl) {
    try { boardThemeStyleEl.remove(); } catch {}
    boardThemeStyleEl = null;
  }
  if (pair) {
    const css = `cg-board {\n  background-color: ${pair.light} !important;\n  background-image: ${pair.pattern || 'none'}, conic-gradient(${pair.light} 90deg, ${pair.dark} 0 180deg, ${pair.light} 0 270deg, ${pair.dark} 0) !important;\n  background-size: auto, 25% 25% !important;\n  background-blend-mode: overlay, normal !important;\n  border: 1px solid ${pair.border || 'transparent'} !important;\n}`;
    const style = document.createElement('style');
    style.id = 'board-theme-css';
    style.textContent = css;
    document.head.appendChild(style);
    boardThemeStyleEl = style;
  }
}

function applyCustomPieceImages(map?: Record<string, string>) {
  if (customStyleEl) {
    try { customStyleEl.remove(); } catch {}
    customStyleEl = null;
  }
  if (!map || !Object.keys(map).length) return;
  const rules: string[] = [];
  for (const key of Object.keys(map)) {
    const url = map[key];
    // key format: '<piece>.<color>' e.g. 'bishop.white'
    const [piece, color] = key.split('.') as [string, string];
    if (!piece || !color) continue;
    rules.push(`.cg-wrap piece.${piece}.${color} { background-image: url('${url}') !important; }`);
  }
  const style = document.createElement('style');
  style.id = 'custom-piece-images';
  style.textContent = rules.join('\n');
  document.head.appendChild(style);
  customStyleEl = style;
}

function post(type: string, payload: any) {
  const target = parentWindow || (typeof window !== 'undefined' ? window.parent : null);
  if (!target) return;
  const targetOrigin = allowedOrigin === '*' ? '*' : allowedOrigin;
  target.postMessage({ type, version: VERSION, ts: Date.now(), payload }, targetOrigin);
}

function ack(forId: string, ok = true, error?: string) {
  post('ack', { for: forId, ok, ...(error ? { error } : {}) });
}

function error(msg: string, ctx?: any) {
  post('error', { message: msg, ...(ctx ? { ctx } : {}) });
}

function ensureBoard() {
  if (controller) return controller;
  const root = document.getElementById('app');
  if (!root) throw new Error('root #app missing');
  const mount = document.createElement('div');
  mount.id = 'board-root';
  mount.setAttribute('data-chessground', '');
  mount.style.width = '100%';
  mount.style.height = '100%';
  mount.style.overflow = 'hidden';
  // mobile friendly sizing
  (root as HTMLElement).style.width = '100%';
  (root as HTMLElement).style.height = '100%';
  (root as HTMLElement).style.overflow = 'hidden';
  (root as HTMLElement).style.touchAction = 'none';
  root.appendChild(mount);

  controller = new BoardController(mount, {
    onReady: () => post('ready', {}),
    onMove: (m) => post('move', m),
    onSelect: (sq) => post('select', { square: sq }),
    onError: (m) => error(m),
  });
  return controller;
}

window.addEventListener('message', (evt: MessageEvent) => {
  console.log('[MFE] message received from', evt.origin, evt.data?.type);
  // Origin check
  if (allowedOrigin !== '*' && evt.origin !== allowedOrigin) {
    // Ignore unexpected origins once allowlist is set
    return;
  }
  const data = evt.data || {};
  if (!data || data.version !== VERSION || !data.type) return;

  const { type, id, payload } = data as { type: string; id?: string; payload?: any };
  parentWindow = parentWindow || (evt.source as Window);

  try {
    switch (type) {
      case 'init': {
        console.log('[MFE] init received from', evt.origin, payload);
        // First message defines allowed origin implicitly
        allowedOrigin = evt.origin || '*';
        const opts = (payload?.options || {}) as InitOptions;
        const board = ensureBoard();
        board.init({
          orientation: opts.orientation || 'white',
          coordinates: opts.coordinates !== false,
          animationMs: typeof opts.animationMs === 'number' ? opts.animationMs : 200,
          blockTouchScroll: opts.blockTouchScroll !== false,
          playerColor: opts.playerColor || 'both',
        });
        if (id) ack(id, true);
        initializedByParent = true;
        // If parent provided theme on init
        if (payload?.theme?.name) applyTheme(payload.theme.name);
        if (payload?.theme?.pieceImages) applyCustomPieceImages(payload.theme.pieceImages);
        break;
      }
      case 'setTheme': {
        applyTheme(payload?.name);
        applyCustomPieceImages(payload?.pieceImages);
        if (id) ack(id, true);
        break;
      }
      case 'setPosition': {
        console.log('[MFE] setPosition', payload?.fen, payload?.lastMove);
        ensureBoard().setPosition(payload);
        if (id) ack(id, true);
        break;
      }
      case 'setLegalDests': {
        console.log('[MFE] setLegalDests', payload?.dests ? 'len=' + payload.dests.length : 'none');
        ensureBoard().setLegalDests(payload?.dests || []);
        if (id) ack(id, true);
        break;
      }
      case 'setPremoveDests': {
        console.log('[MFE] setPremoveDests', payload?.dests ? 'len=' + payload.dests.length : 'none');
        ensureBoard().setPremoveDests(payload?.dests || []);
        if (id) ack(id, true);
        break;
      }
      case 'setTurn': {
        console.log('[MFE] setTurn', payload?.color);
        ensureBoard().setTurn(payload?.color);
        if (id) ack(id, true);
        break;
      }
      case 'setDraggable': {
        console.log('[MFE] setDraggable', payload);
        ensureBoard().setDraggable(!!payload?.enabled, payload?.playerColor || 'both');
        if (id) ack(id, true);
        break;
      }
      case 'setFreeMode': {
        console.log('[MFE] setFreeMode', payload?.free);
        ensureBoard().setFreeMode(!!payload?.free);
        if (id) ack(id, true);
        break;
      }
      case 'clearPremoves': {
        ensureBoard().clearPremoves();
        if (id) ack(id, true);
        break;
      }
      case 'playPremove': {
        ensureBoard().playPremove();
        if (id) ack(id, true);
        break;
      }
      case 'flip': {
        ensureBoard().flip();
        if (id) ack(id, true);
        break;
      }
      case 'setSize': {
        const w = Number(payload?.width) || 0;
        const h = Number(payload?.height) || 0;
        ensureBoard().setSize(w, h);
        if (id) ack(id, true);
        break;
      }
      case 'reset': {
        if (controller) controller.destroy();
        controller = null;
        const root = document.getElementById('app');
        if (root) root.innerHTML = '';
        if (id) ack(id, true);
        break;
      }
      default:
        console.warn('[MFE] unknown message', type);
        if (id) ack(id, false, `Unknown type ${type}`);
    }
  } catch (e: any) {
    if (id) ack(id, false, e?.message || 'handler error');
    error('handler exception', { type, message: e?.message });
  }
});

// Notify parent that the iframe booted and is ready to be init()
window.addEventListener('load', () => {
  console.log('[MFE] window load, sending hello');
  try {
    const isEmbedded = window.self !== window.top;
    document.documentElement.classList.toggle('embedded', isEmbedded);
    document.documentElement.classList.toggle('standalone', !isEmbedded);
    document.body.classList.toggle('embedded', isEmbedded);
    document.body.classList.toggle('standalone', !isEmbedded);
  } catch {}
  // Theme via query param
  try {
    const usp = new URLSearchParams(window.location.search);
    const theme = usp.get('theme');
    if (theme) applyTheme(theme);
    const board = usp.get('board');
    if (board) applyTheme(board);
    if (!theme && !board) applyTheme('blue');
  } catch {}
  // Send "hello" without strict origin; parent should reply with init
  post('hello', { version: VERSION });
  // Fallback: if no parent initializes within 1000ms, self-init with a default board for debugging
  setTimeout(() => {
    if (!initializedByParent) {
      console.log('[MFE] No parent init received; self-initializing for debug');
      const board = ensureBoard();
      board.init({ orientation: 'white', coordinates: true, animationMs: 200, blockTouchScroll: true, playerColor: 'both' });
      board.setPosition({
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR',
        turnColor: 'white',
        orientation: 'white',
      } as any);
      // Allow free dragging when running standalone so users can move pieces
      board.setFreeMode(true);
    }
  }, 1000);
});

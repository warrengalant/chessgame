import 'chessground/assets/chessground.base.css';
import 'chessground/assets/chessground.brown.css';
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

function post(type: string, payload: any) {
  if (!parentWindow) return;
  parentWindow.postMessage({ type, version: VERSION, ts: Date.now(), payload }, allowedOrigin === '*' ? '*' : allowedOrigin);
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
  // mobile friendly sizing
  (root as HTMLElement).style.width = '100%';
  (root as HTMLElement).style.height = '100svh';
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
        break;
      }
      case 'setPosition': {
        ensureBoard().setPosition(payload);
        if (id) ack(id, true);
        break;
      }
      case 'setLegalDests': {
        ensureBoard().setLegalDests(payload?.dests || []);
        if (id) ack(id, true);
        break;
      }
      case 'setTurn': {
        ensureBoard().setTurn(payload?.color);
        if (id) ack(id, true);
        break;
      }
      case 'setDraggable': {
        ensureBoard().setDraggable(!!payload?.enabled, payload?.playerColor || 'both');
        if (id) ack(id, true);
        break;
      }
      case 'setFreeMode': {
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
        if (id) ack(id, false, `Unknown type ${type}`);
    }
  } catch (e: any) {
    if (id) ack(id, false, e?.message || 'handler error');
    error('handler exception', { type, message: e?.message });
  }
});

// Notify parent that the iframe booted and is ready to be init()
window.addEventListener('load', () => {
  // Send "hello" without strict origin; parent should reply with init
  post('hello', { version: VERSION });
});

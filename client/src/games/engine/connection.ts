// Connexion WebSocket d'un joueur. Reprise automatique : après une coupure (réseau, téléphone en veille),
// on se reconnecte seul avec le même jeton de place (attente croissante, 10 s au plus) et le serveur
// renvoie l'état complet de la table — aucune logique de rattrapage. La place est gardée 45 s par le
// serveur. Seuls une place expirée, un autre onglet ou la fermeture de la table arrêtent la reprise.
import type { ClientMessage, ErrorCode, RoomView, ServerMessage } from '../../../../shared/games/protocol.ts';
import { setClockOffset, setServerTime } from './clock.ts';

export type EndReason = 'seat_lost' | 'replaced' | 'left' | 'table_closed';

export interface ConnectionEvents {
  room(view: RoomView): void;
  error(code: ErrorCode): void;
  status(status: 'connecting' | 'online' | 'reconnecting'): void;
  ended(reason: EndReason): void;
}

const CLOSE_REASONS: Record<number, EndReason> = { 4000: 'left', 4002: 'replaced', 4003: 'seat_lost', 4004: 'table_closed' };
const SYNC_EVERY_MS = 30_000;
const MAX_BACKOFF_MS = 10_000;

export class GameConnection {
  readonly #token: string;
  readonly #events: ConnectionEvents;
  #socket: WebSocket | null = null;
  #attempt = 0;
  #stopped = false;
  #retryTimer: ReturnType<typeof setTimeout> | null = null;
  #syncTimer: ReturnType<typeof setInterval> | null = null;

  constructor(token: string, events: ConnectionEvents) {
    this.#token = token;
    this.#events = events;
    document.addEventListener('visibilitychange', this.#onVisible);
    window.addEventListener('online', this.#onVisible);
  }

  open(): void {
    if (this.#stopped) return;
    this.#events.status(this.#attempt === 0 ? 'connecting' : 'reconnecting');
    const socket = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
    this.#socket = socket;
    socket.addEventListener('open', () => this.send({ t: 'hello', token: this.#token }));
    socket.addEventListener('message', (event) => this.#receive(String(event.data)));
    socket.addEventListener('close', (event) => this.#closed(socket, event.code));
  }

  send(message: ClientMessage): void {
    if (this.#socket?.readyState === WebSocket.OPEN) this.#socket.send(JSON.stringify(message));
  }

  /** Arrêt définitif (quitter la table). */
  stop(): void {
    this.#stopped = true;
    this.#clearTimers();
    document.removeEventListener('visibilitychange', this.#onVisible);
    window.removeEventListener('online', this.#onVisible);
    this.#socket?.close(1000);
  }

  // Retour au premier plan ou du réseau : on n'attend pas la fin du délai de reprise
  readonly #onVisible = (): void => {
    if (document.visibilityState !== 'visible' || this.#stopped) return;
    const state = this.#socket?.readyState;
    if (state === WebSocket.OPEN || state === WebSocket.CONNECTING) return;
    if (this.#retryTimer) clearTimeout(this.#retryTimer);
    this.#retryTimer = null;
    this.open();
  };

  #receive(raw: string): void {
    let message: ServerMessage;
    try {
      message = JSON.parse(raw) as ServerMessage;
    } catch {
      return;
    }
    switch (message.t) {
      case 'welcome':
        this.#attempt = 0;
        setServerTime(message.serverTime);
        this.#sync();
        if (this.#syncTimer) clearInterval(this.#syncTimer);
        this.#syncTimer = setInterval(() => this.#sync(), SYNC_EVERY_MS);
        this.#events.status('online');
        break;
      case 'sync':
        setClockOffset(message.serverTime, message.clientTime, Date.now());
        break;
      case 'room':
        this.#events.room(message.room);
        break;
      case 'error':
        if (message.code === 'invalid_token') this.#end('seat_lost');
        else if (message.code === 'replaced') this.#end('replaced');
        else this.#events.error(message.code);
        break;
    }
  }

  #sync(): void {
    this.send({ t: 'sync', clientTime: Date.now() });
  }

  #closed(socket: WebSocket, code: number): void {
    if (socket !== this.#socket || this.#stopped) return;
    if (this.#syncTimer) clearInterval(this.#syncTimer);
    const reason = CLOSE_REASONS[code];
    if (reason) {
      this.#end(reason);
      return;
    }
    // coupure : reprise automatique avec la même place
    this.#attempt += 1;
    const delay = Math.min(MAX_BACKOFF_MS, 500 * 2 ** (this.#attempt - 1)) + Math.random() * 300;
    this.#events.status('reconnecting');
    this.#retryTimer = setTimeout(() => {
      this.#retryTimer = null;
      this.open();
    }, delay);
  }

  #end(reason: EndReason): void {
    if (this.#stopped) return;
    this.stop();
    this.#events.ended(reason);
  }

  #clearTimers(): void {
    if (this.#retryTimer) clearTimeout(this.#retryTimer);
    if (this.#syncTimer) clearInterval(this.#syncTimer);
    this.#retryTimer = null;
    this.#syncTimer = null;
  }
}

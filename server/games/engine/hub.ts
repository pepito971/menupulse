// Serveur WebSocket des jeux, sur /ws du même serveur HTTP. Protections :
//  - en-tête Origin vérifié à l'ouverture (sinon n'importe quel site peut ouvrir une connexion au nom
//    du joueur) ;
//  - messages de 2 Ko au plus, validés (Zod), limités à 10 par seconde par connexion (seau à jetons :
//    express-rate-limit ne voit pas les messages WebSocket) ;
//  - « hello » obligatoire dans les 5 s, avec le jeton de place (jamais dans l'URL : elle finit dans les
//    journaux) ;
//  - battement de cœur toutes les 15 s : une connexion qui ne répond plus est coupée (place gardée
//    45 s par la salle, pour une reconnexion).
// En développement, Vite gère ses propres demandes d'upgrade (rechargement à chaud) sur ce même serveur :
// on ne touche qu'à /ws.
import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer, type RawData, type WebSocket } from 'ws';
import type { ServerMessage } from '../../../shared/games/protocol.ts';
import type { GameRooms, PlayerSession } from '../game-rooms.ts';
import { parseClientMessage } from './protocol.ts';

export const MAX_MESSAGE_BYTES = 2048;
export const HEARTBEAT_MS = 15_000;
export const HELLO_TIMEOUT_MS = 5000;
const BUCKET_CAPACITY = 20;
const BUCKET_REFILL_PER_SECOND = 10;
const MAX_STRIKES = 50;

interface SocketState {
  alive: boolean;
  tokens: number;
  refilledAt: number;
  strikes: number;
  session: PlayerSession | null;
}

export function attachGameSocket(server: Server, rooms: GameRooms, options: { allowedOrigins: readonly string[]; leaveOtherUpgrades: boolean }) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES });
  const states = new Map<WebSocket, SocketState>();

  server.on('upgrade', (request: IncomingMessage, socket: Duplex, head: Buffer) => {
    const { pathname } = new URL(request.url ?? '/', 'http://localhost');
    if (pathname !== '/ws') {
      if (!options.leaveOtherUpgrades) socket.destroy();
      return;
    }
    if (!options.allowedOrigins.includes(request.headers.origin ?? '')) {
      socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(request, socket, head, (ws) => onConnection(ws));
  });

  function send(ws: WebSocket, message: ServerMessage): void {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message));
  }

  function allow(state: SocketState): boolean {
    const now = Date.now();
    state.tokens = Math.min(BUCKET_CAPACITY, state.tokens + ((now - state.refilledAt) / 1000) * BUCKET_REFILL_PER_SECOND);
    state.refilledAt = now;
    if (state.tokens < 1) return false;
    state.tokens -= 1;
    return true;
  }

  function onConnection(ws: WebSocket): void {
    const state: SocketState = { alive: true, tokens: BUCKET_CAPACITY, refilledAt: Date.now(), strikes: 0, session: null };
    states.set(ws, state);
    const helloTimer = setTimeout(() => ws.close(4001, 'Message hello attendu'), HELLO_TIMEOUT_MS);

    ws.on('pong', () => {
      state.alive = true;
    });

    ws.on('message', (data: RawData, isBinary: boolean) => {
      if (isBinary) {
        ws.close(1003, 'Texte uniquement');
        return;
      }
      if (!allow(state)) {
        state.strikes += 1;
        if (state.strikes > MAX_STRIKES) ws.close(4008, 'Trop de messages');
        else send(ws, { t: 'error', code: 'rate_limited' });
        return;
      }
      const message = parseClientMessage(data.toString());
      if (!message) {
        send(ws, { t: 'error', code: 'invalid_message' });
        return;
      }
      if (!state.session) {
        if (message.t !== 'hello') {
          send(ws, { t: 'error', code: 'invalid_token' });
          return;
        }
        state.session = rooms.connect(message.token, { send: (m) => send(ws, m), close: (code, reason) => ws.close(code, reason) });
        if (!state.session) {
          send(ws, { t: 'error', code: 'invalid_token' });
          ws.close(4003, 'Place inconnue ou expirée');
          return;
        }
        clearTimeout(helloTimer);
        return;
      }
      state.session.handle(message);
    });

    ws.on('close', () => {
      clearTimeout(helloTimer);
      state.session?.disconnect();
      states.delete(ws);
    });

    ws.on('error', (error) => {
      console.warn('[jeux] erreur de connexion', error.message);
    });
  }

  const heartbeat = setInterval(() => {
    for (const [ws, state] of states) {
      if (!state.alive) {
        ws.terminate(); // déclenche « close » : la place passe en attente de reconnexion
        continue;
      }
      state.alive = false;
      ws.ping();
    }
  }, HEARTBEAT_MS);
  heartbeat.unref();

  return {
    close(): void {
      clearInterval(heartbeat);
      for (const ws of states.keys()) ws.close(1001, 'Arrêt du serveur');
      wss.close();
    },
  };
}

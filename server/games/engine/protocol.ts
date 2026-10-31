// Validation des messages reçus sur /ws (types : shared/games/protocol.ts). L'action de jeu elle-même
// (`payload`) est validée ensuite par le jeu en cours.
import { z } from 'zod';
import type { ClientMessage } from '../../../shared/games/protocol.ts';

export const clientMessageSchema = z.discriminatedUnion('t', [
  z.object({ t: z.literal('hello'), token: z.string().min(16).max(64) }),
  z.object({ t: z.literal('start'), gameId: z.string().min(1).max(32) }),
  z.object({ t: z.literal('action'), payload: z.unknown() }),
  z.object({ t: z.literal('leave') }),
  z.object({ t: z.literal('sync'), clientTime: z.number().finite() }),
]);

export function parseClientMessage(raw: string): ClientMessage | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  const parsed = clientMessageSchema.safeParse(data);
  return parsed.success ? (parsed.data as ClientMessage) : null;
}

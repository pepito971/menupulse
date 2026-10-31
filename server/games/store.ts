// Ce dont le moteur de jeux a besoin de la base, derrière une interface : le gestionnaire des tables se
// teste avec une version en mémoire, la vraie version est db-store.ts.
import type { HappyHourRule } from '../../shared/happy-hour.ts';
import type { VoucherEffect } from '../../shared/games/types.ts';
import type { Locale } from '../../shared/locales.ts';
import type { DrinkForGame } from './boisson-mystere/hints.ts';

export interface TableInfo {
  tableId: string;
  label: string;
  establishmentId: string;
  establishmentName: string;
  timezone: string;
  locales: Locale[];
  defaultLocale: Locale;
  gamesOpen: boolean; // le personnel a ouvert les jeux pour la soirée
  tapsyActive: boolean;
}

export interface EstablishmentGameConfig {
  timezone: string;
  happyHours: HappyHourRule[];
  games: Map<string, { enabled: boolean; settings: unknown }>;
}

export interface GameStore {
  findTable(qrToken: string): Promise<TableInfo | null>;
  loadConfig(establishmentId: string): Promise<EstablishmentGameConfig>;
  /** Pack publié de l'établissement, sinon pack global de Menupulse, sinon null (contenu fourni par le jeu). */
  loadPack(establishmentId: string, gameId: string): Promise<unknown | null>;
  loadDrinks(establishmentId: string, allowAlcoholic: boolean): Promise<DrinkForGame[]>;
  countVouchersToday(establishmentId: string, gameId: string, timezone: string): Promise<number>;
  sessionStarted(input: { establishmentId: string; tableId: string; gameId: string; gameVersion: number; playerCount: number }): Promise<string>;
  sessionEnded(sessionId: string, playerCount: number, reason: 'finished' | 'abandoned'): Promise<void>;
  saveVoucher(input: { establishmentId: string; tableId: string; gameId: string; voucher: VoucherEffect }): Promise<void>;
  recordHallOfFame(input: { establishmentId: string; gameId: string; pseudo: string; score: number; timezone: string; now: Date }): Promise<void>;
  /** Records d'une période (meilleur pseudo par jeu). */
  loadHallOfFame(establishmentId: string, period: 'week' | 'month', periodStart: string): Promise<{ gameId: string; pseudo: string; score: number }[]>;
  /** Au démarrage : les parties restées ouvertes ont été interrompues par l'arrêt du serveur. */
  closeInterruptedSessions(): Promise<number>;
}

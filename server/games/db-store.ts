// Accès à la base du moteur de jeux (implémentation de GameStore).
import { and, desc, eq, gt, isNull, or, sql } from 'drizzle-orm';
import { isLocale, type Localized } from '../../shared/locales.ts';
import { periodStarts } from '../../shared/periods.ts';
import { db } from '../db/client.ts';
import {
  categories,
  diningTables,
  establishmentGames,
  establishmentModules,
  establishments,
  gameContentPacks,
  gameHallOfFame,
  gameSessions,
  gameVouchers,
  happyHours,
  products,
  type DrinkDetails,
} from '../db/schema.ts';
import type { GameStore } from './store.ts';

export const dbGameStore: GameStore = {
  async findTable(qrToken) {
    const [row] = await db
      .select({
        tableId: diningTables.id,
        label: diningTables.label,
        establishmentId: establishments.id,
        establishmentName: establishments.name,
        timezone: establishments.timezone,
        locales: establishments.locales,
        defaultLocale: establishments.defaultLocale,
        gamesOpenUntil: establishments.gamesOpenUntil,
      })
      .from(diningTables)
      .innerJoin(establishments, eq(establishments.id, diningTables.establishmentId))
      .where(and(eq(diningTables.qrToken, qrToken), eq(diningTables.isActive, true), isNull(establishments.deletedAt)))
      .limit(1);
    if (!row) return null;
    const [tapsy] = await db
      .select({ status: establishmentModules.status })
      .from(establishmentModules)
      .where(and(eq(establishmentModules.establishmentId, row.establishmentId), eq(establishmentModules.module, 'tapsy')));
    return {
      tableId: row.tableId,
      label: row.label,
      establishmentId: row.establishmentId,
      establishmentName: row.establishmentName,
      timezone: row.timezone,
      locales: row.locales.filter(isLocale),
      defaultLocale: row.defaultLocale,
      gamesOpen: row.gamesOpenUntil !== null && row.gamesOpenUntil.getTime() > Date.now(),
      tapsyActive: tapsy?.status === 'active',
    };
  },

  async loadConfig(establishmentId) {
    const [establishment] = await db.select({ timezone: establishments.timezone }).from(establishments).where(eq(establishments.id, establishmentId));
    const rules = await db.select().from(happyHours).where(eq(happyHours.establishmentId, establishmentId));
    const games = await db.select().from(establishmentGames).where(eq(establishmentGames.establishmentId, establishmentId));
    return {
      timezone: establishment?.timezone ?? 'Europe/Paris',
      happyHours: rules.map((rule) => ({ weekdays: rule.weekdays, startsAt: rule.startsAt, endsAt: rule.endsAt, isActive: rule.isActive })),
      games: new Map(games.map((game) => [game.gameId, { enabled: game.isEnabled, settings: game.settings }])),
    };
  },

  async loadPack(establishmentId, gameId) {
    const [pack] = await db
      .select({ content: gameContentPacks.content })
      .from(gameContentPacks)
      .where(
        and(
          eq(gameContentPacks.gameId, gameId),
          eq(gameContentPacks.isPublished, true),
          or(eq(gameContentPacks.establishmentId, establishmentId), isNull(gameContentPacks.establishmentId)),
        ),
      )
      .orderBy(sql`${gameContentPacks.establishmentId} IS NULL`, desc(gameContentPacks.updatedAt))
      .limit(1);
    return pack?.content ?? null;
  },

  async loadDrinks(establishmentId, allowAlcoholic) {
    const rows = await db
      .select({ id: products.id, name: products.name, abv: products.abv, details: products.details, category: categories.name })
      .from(products)
      .innerJoin(categories, and(eq(categories.establishmentId, products.establishmentId), eq(categories.id, products.categoryId)))
      .where(
        and(
          eq(products.establishmentId, establishmentId),
          eq(products.kind, 'drink'),
          eq(products.isVisible, true),
          eq(products.isAvailable, true),
          eq(categories.isVisible, true),
          eq(categories.module, 'tapsy'),
          // par défaut, uniquement des boissons dont on SAIT qu'elles sont sans alcool
          allowAlcoholic ? undefined : eq(products.abv, 0),
        ),
      );
    return rows.map((row) => {
      const details = row.details as DrinkDetails;
      return {
        id: row.id,
        name: row.name as Localized,
        category: (row.category as Localized | null) ?? null,
        abv: row.abv,
        ibu: details.ibu,
        style: details.style,
        origin: details.origin,
        tastingNotes: details.tastingNotes,
      };
    });
  },

  async countVouchersToday(establishmentId, gameId, timezone) {
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(gameVouchers)
      .where(
        and(
          eq(gameVouchers.establishmentId, establishmentId),
          eq(gameVouchers.gameId, gameId),
          gt(gameVouchers.createdAt, sql`date_trunc('day', now() AT TIME ZONE ${timezone}) AT TIME ZONE ${timezone}`),
        ),
      );
    return row?.count ?? 0;
  },

  async sessionStarted(input) {
    const [row] = await db
      .insert(gameSessions)
      .values({ ...input, roomKind: 'table' })
      .returning({ id: gameSessions.id });
    return row!.id;
  },

  async sessionEnded(sessionId, playerCount, reason) {
    await db.update(gameSessions).set({ endedAt: new Date(), endReason: reason, playerCount }).where(eq(gameSessions.id, sessionId));
  },

  async saveVoucher({ establishmentId, tableId, gameId, voucher }) {
    await db.insert(gameVouchers).values({
      establishmentId,
      tableId,
      gameId,
      code: voucher.code,
      reward: voucher.reward,
      productId: voucher.productId ?? null,
      expiresAt: new Date(voucher.expiresAt),
    });
  },

  async recordHallOfFame({ establishmentId, gameId, pseudo, score, timezone, now }) {
    const starts = periodStarts(now, timezone);
    for (const [period, periodStart] of [['week', starts.week], ['month', starts.month]] as const) {
      await db
        .insert(gameHallOfFame)
        .values({ establishmentId, gameId, period, periodStart, pseudo, score, achievedAt: now })
        .onConflictDoUpdate({
          target: [gameHallOfFame.establishmentId, gameHallOfFame.gameId, gameHallOfFame.period, gameHallOfFame.periodStart],
          set: { pseudo: sql`excluded.pseudo`, score: sql`excluded.score`, achievedAt: sql`excluded.achieved_at` },
          setWhere: sql`excluded.score > ${gameHallOfFame.score}`, // seul un meilleur score remplace le record
        });
    }
  },

  async loadHallOfFame(establishmentId, period, periodStart) {
    return db
      .select({ gameId: gameHallOfFame.gameId, pseudo: gameHallOfFame.pseudo, score: gameHallOfFame.score })
      .from(gameHallOfFame)
      .where(and(eq(gameHallOfFame.establishmentId, establishmentId), eq(gameHallOfFame.period, period), eq(gameHallOfFame.periodStart, periodStart)))
      .orderBy(desc(gameHallOfFame.score));
  },

  async closeInterruptedSessions() {
    const rows = await db
      .update(gameSessions)
      .set({ endedAt: new Date(), endReason: 'server_restart' })
      .where(isNull(gameSessions.endedAt))
      .returning({ id: gameSessions.id });
    return rows.length;
  },
};


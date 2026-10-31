// Dates locales d'un établissement (son fuseau), pour le tableau d'honneur et les limites quotidiennes.

/** 'AAAA-MM-JJ' à l'heure locale du fuseau. */
export function localDay(now: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/** Début de la semaine (lundi) et du mois en cours, en dates locales. */
export function periodStarts(now: Date, timeZone: string): { week: string; month: string } {
  const day = localDay(now, timeZone);
  const [year, month, date] = day.split('-').map(Number) as [number, number, number];
  const utc = new Date(Date.UTC(year, month - 1, date));
  const isoWeekday = ((utc.getUTCDay() + 6) % 7) + 1; // 1 = lundi
  utc.setUTCDate(utc.getUTCDate() - (isoWeekday - 1));
  return { week: utc.toISOString().slice(0, 10), month: `${day.slice(0, 7)}-01` };
}

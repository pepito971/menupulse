// Happy Hour : on stocke la RÈGLE (jours, horaires, fuseau de l'établissement), jamais un prix déjà
// calculé. Le serveur et le téléphone appliquent la même fonction : même un menu affiché depuis le
// cache montre le bon prix à la bonne heure.

export interface HappyHourRule {
  weekdays: readonly number[]; // 1 = lundi … 7 = dimanche (ISO)
  startsAt: string; // 'HH:MM' ou 'HH:MM:SS' (colonne time de Postgres)
  endsAt: string; // antérieur à startsAt = se termine le lendemain
  isActive?: boolean;
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Jour ISO et minutes écoulées depuis minuit, à l'heure locale du fuseau donné. */
export function localClock(now: Date, timeZone: string): { weekday: number; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? '';
  return {
    weekday: WEEKDAYS.indexOf(part('weekday')) + 1,
    minutes: Number(part('hour')) * 60 + Number(part('minute')),
  };
}

function toMinutes(time: string): number {
  const [hours = '0', minutes = '0'] = time.split(':');
  return Number(hours) * 60 + Number(minutes);
}

export function isHappyHourActive(rules: readonly HappyHourRule[], now: Date, timeZone: string): boolean {
  const { weekday, minutes } = localClock(now, timeZone);
  const previousDay = weekday === 1 ? 7 : weekday - 1;
  return rules.some((rule) => {
    if (rule.isActive === false) return false;
    const start = toMinutes(rule.startsAt);
    const end = toMinutes(rule.endsAt);
    if (start < end) return rule.weekdays.includes(weekday) && minutes >= start && minutes < end;
    // la plage passe minuit : elle commence le jour prévu et se termine le lendemain
    return (rule.weekdays.includes(weekday) && minutes >= start) || (rule.weekdays.includes(previousDay) && minutes < end);
  });
}

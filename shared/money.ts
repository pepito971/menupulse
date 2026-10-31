// Les prix sont toujours des entiers en centimes : jamais de nombre à virgule pour de l'argent.
export function formatPrice(cents: number, locale: string, currency = 'EUR'): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(cents / 100);
}

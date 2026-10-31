// Horloge du serveur vue du téléphone, et minuteurs affichés. Les échéances envoyées par le serveur sont
// dans SON horloge : on corrige avec l'écart mesuré (moitié de l'aller-retour). Une seule boucle
// requestAnimationFrame met à jour tous les minuteurs de la page (aucune fuite quand un écran est
// redessiné : un élément retiré du DOM n'est simplement plus trouvé).
import { h } from './dom.ts';

let offsetMs = 0;
let secondsLabel = (seconds: number) => `${seconds} s`;
let running = false;

export function setClockOffset(serverTime: number, sentAt: number, receivedAt: number): void {
  offsetMs = serverTime - (sentAt + receivedAt) / 2;
}

export function setServerTime(serverTime: number): void {
  offsetMs = serverTime - Date.now();
}

export function serverNow(): number {
  return Date.now() + offsetMs;
}

/** Heure locale du téléphone correspondant à un instant de l'horloge du serveur. */
export function toLocalTime(serverTimestamp: number): Date {
  return new Date(serverTimestamp - offsetMs);
}

export function setSecondsLabel(format: (seconds: number) => string): void {
  secondsLabel = format;
}

function tick(): void {
  const timers = document.querySelectorAll<HTMLElement>('[data-deadline]');
  const now = serverNow();
  for (const timer of timers) {
    const deadline = Number(timer.dataset.deadline);
    const duration = Number(timer.dataset.duration) || 1;
    const remaining = Math.max(0, deadline - now);
    const fill = timer.querySelector<HTMLElement>('.timer-fill');
    if (fill) fill.style.transform = `scaleX(${Math.min(1, remaining / duration)})`;
    const label = timer.querySelector<HTMLElement>('.timer-label');
    const text = secondsLabel(Math.ceil(remaining / 1000));
    if (label && label.textContent !== text) label.textContent = text;
    timer.classList.toggle('is-urgent', remaining < 5000);
  }
  if (timers.length > 0) requestAnimationFrame(tick);
  else running = false;
}

function ensureRunning(): void {
  if (running) return;
  running = true;
  requestAnimationFrame(tick);
}

/** Barre de temps restant (avec le nombre de secondes). */
export function timerBar(deadline: number, durationMs: number): HTMLElement {
  ensureRunning();
  return h(
    'div',
    { class: 'timer', 'data-deadline': deadline, 'data-duration': durationMs, role: 'timer' },
    h('div', { class: 'timer-track', 'aria-hidden': 'true' }, h('div', { class: 'timer-fill' })),
    h('span', { class: 'timer-label' }),
  );
}

/** Compte à rebours en texte seul (« Prochain indice dans 12 s »). */
export function countdown(deadline: number, prefix: string): HTMLElement {
  ensureRunning();
  return h('p', { class: 'game-sub timer timer--text', 'data-deadline': deadline, 'data-duration': 1 }, `${prefix} `, h('span', { class: 'timer-label' }));
}

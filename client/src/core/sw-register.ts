// En production seulement : en développement, un Service Worker servirait du code périmé.
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('/sw.js').catch((error: unknown) => {
    console.warn('Service Worker non enregistré', error);
  });
}

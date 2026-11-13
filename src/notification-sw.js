// Runs inside the service worker (imported through ngsw-config.json). It decides what a tap on one of
// our notifications does. Reminder and news notifications carry, in `data`:
//   url       the page to open
//   category  'reminders' or 'news'
//   muteUrl   the API address that changes this device's notification switches
// and a "Turn off" button (action 'mute'). That button switches the category off for this device without
// opening the site; the device's own push subscription address is what identifies it to the API.
// Browsers that show no buttons open `url` instead, which carries ?push=<category> so the site can offer
// the same one-tap way out (see PushOptOutComponent).
self.addEventListener('notificationclick', (event) => {
  const data = event.notification.data || {};
  event.notification.close();

  if (event.action === 'mute' && data.muteUrl && data.category) {
    event.waitUntil(
      self.registration.pushManager.getSubscription()
        .then((subscription) => {
          if (!subscription) return undefined;
          return fetch(data.muteUrl, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ endpoint: subscription.endpoint, [data.category]: false }),
          });
        })
        .catch(() => undefined)
    );
    return;
  }

  const url = data.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((windowClients) => {
      // Reuse a tab that is already on that page.
      for (const client of windowClients) {
        if (client.url === url && 'focus' in client) {
          return client.focus();
        }
      }
      return clients.openWindow ? clients.openWindow(url) : undefined;
    })
  );
});

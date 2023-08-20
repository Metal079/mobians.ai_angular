self.addEventListener('notificationclick', (event) => {
    console.log("Notification Clicked");
    event.notification.close();
    event.waitUntil(
      clients.matchAll({type: 'window'}).then(windowClients => {
        // Check if there's already a tab open with this URL.
        for (let client of windowClients) {
          if (client.url === event.notification.data.url && 'focus' in client) {
            // We already have a tab to use, focus it.
            console.log("Notification Clicked3");
            return client.focus();
          }
        }
        // If we don't find an existing client, open a new tab.
        if (clients.openWindow) {
            console.log("Notification Clicked 2");
          return clients.openWindow(event.notification.data.url);
        }
      })
    );
  });
  
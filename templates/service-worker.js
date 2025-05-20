self.addEventListener('push', (event) => {
  const data = event.data.json();
  self.registration.showNotification(data.title, {
    body: data.body,
    icon: '/pictures/high-priority.png',
    tag: data.tag
  });
  // Gửi tín hiệu đến trang để phát âm thanh
  self.clients.matchAll().then((clients) => {
    clients.forEach((client) => client.postMessage({ type: 'push-notification' }));
  });
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow('/templates/check-abnormal.html'));
});

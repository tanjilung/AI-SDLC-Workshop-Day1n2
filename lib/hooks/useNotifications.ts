'use client';

import { useEffect, useState } from 'react';
import { formatSingaporeDateTime } from '../timezone';

type DueNotification = {
  id: string;
  title: string;
  due_date: string | null;
  reminder_minutes: number | null;
};

export function useNotifications(onError?: (message: string) => void) {
  const [permission, setPermission] = useState<'default' | 'denied' | 'granted' | 'unsupported'>(() => {
    if (typeof window === 'undefined' || typeof Notification === 'undefined') {
      return 'unsupported';
    }

    return Notification.permission;
  });

  async function requestPermission() {
    if (typeof window === 'undefined' || typeof Notification === 'undefined') {
      setPermission('unsupported');
      return 'unsupported' as const;
    }

    const nextPermission = await Notification.requestPermission();
    setPermission(nextPermission);
    return nextPermission;
  }

  useEffect(() => {
    if (permission !== 'granted' || typeof window === 'undefined' || typeof Notification === 'undefined') {
      return;
    }

    let cancelled = false;

    async function pollNotifications() {
      try {
        const response = await fetch('/api/notifications/check');
        if (!response.ok) {
          if (response.status !== 401 && onError) {
            onError('Unable to check reminders right now.');
          }
          return;
        }

        const payload = (await response.json()) as { notifications: DueNotification[] };
        if (cancelled) {
          return;
        }

        payload.notifications.forEach((notification) => {
          const body = notification.due_date
            ? `Due at ${formatSingaporeDateTime(new Date(notification.due_date))}`
            : 'Reminder due now';

          new Notification(notification.title, {
            body,
            tag: notification.id
          });
        });
      } catch {
        if (!cancelled && onError) {
          onError('Unable to check reminders right now.');
        }
      }
    }

    void pollNotifications();
    const intervalId = window.setInterval(() => {
      void pollNotifications();
    }, 30_000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [onError, permission]);

  return {
    permission,
    supported: permission !== 'unsupported',
    enabled: permission === 'granted',
    requestPermission
  };
}

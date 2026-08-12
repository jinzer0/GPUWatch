export interface NotificationEvent {
  readonly title: string;
  readonly body: string;
}

export interface NotificationNotifier {
  show(event: NotificationEvent): void;
}

export interface NativeNotification {
  show(): void;
}

export interface NativeNotificationConstructor {
  new (event: NotificationEvent): NativeNotification;
}

export function createMacosNotificationNotifier(Notification: NativeNotificationConstructor): NotificationNotifier {
  return {
    show(event) {
      new Notification(event).show();
    }
  };
}

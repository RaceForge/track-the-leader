import { Injectable, signal } from '@angular/core';

export type NotificationType = 'info' | 'error' | 'success';
export type Notification = { message: string; type: NotificationType } | null;

@Injectable({
	providedIn: 'root',
})
export class NotificationService {
	notification = signal<Notification>(null);
	private notificationTimeout: ReturnType<typeof setTimeout> | null = null;

	show(
		message: string,
		type: NotificationType = 'info',
		duration = 4000,
	): void {
		if (this.notificationTimeout) {
			clearTimeout(this.notificationTimeout);
		}

		this.notification.set({ message, type });

		this.notificationTimeout = setTimeout(() => {
			this.notification.set(null);
			this.notificationTimeout = null;
		}, duration);
	}

	dismiss(): void {
		if (this.notificationTimeout) {
			clearTimeout(this.notificationTimeout);
			this.notificationTimeout = null;
		}
		this.notification.set(null);
	}
}

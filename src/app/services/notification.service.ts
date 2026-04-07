import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import {
  LocalNotifications,
  LocalNotificationSchema,
  PermissionStatus
} from '@capacitor/local-notifications';
import { StockSignal } from '../models/stock.model';

@Injectable({
  providedIn: 'root'
})
export class NotificationService {
  private scheduledNotificationId = 1001;

  async requestPermission(): Promise<boolean> {
    if (Capacitor.getPlatform() === 'web') {
      if (!('Notification' in window)) {
        return false;
      }

      if (Notification.permission === 'granted') {
        return true;
      }

      const permission = await Notification.requestPermission();
      return permission === 'granted';
    }

    const status: PermissionStatus = await LocalNotifications.requestPermissions();
    return status.display === 'granted';
  }

  async scheduleMorningDigest(watchSignals: StockSignal[], topPicks: StockSignal[]): Promise<void> {
    const allowed = await this.requestPermission();
    if (!allowed) {
      return;
    }

    if (Capacitor.getPlatform() === 'web') {
      this.scheduleWebDigest(watchSignals, topPicks);
      return;
    }

    await LocalNotifications.cancel({
      notifications: [{ id: this.scheduledNotificationId }]
    });

    const now = new Date();
    const nextMorning = new Date();
    nextMorning.setHours(9, 0, 0, 0);
    if (nextMorning <= now) {
      nextMorning.setDate(nextMorning.getDate() + 1);
    }

    const notification: LocalNotificationSchema = {
      id: this.scheduledNotificationId,
      title: 'Daily Stock Watchlist Summary',
      body: this.buildBody(watchSignals, topPicks),
      schedule: {
        at: nextMorning,
        repeats: true,
        every: 'day'
      }
    };

    await LocalNotifications.schedule({
      notifications: [notification]
    });
  }

  async sendDigest(watchSignals: StockSignal[], topPicks: StockSignal[]): Promise<void> {
    if (Capacitor.getPlatform() === 'web') {
      this.sendWebDigest(watchSignals, topPicks);
      return;
    }

    const allowed = await this.requestPermission();
    if (!allowed) {
      return;
    }

    await LocalNotifications.schedule({
      notifications: [
        {
          id: Date.now() % 100000,
          title: 'Daily Stock Watchlist Summary',
          body: this.buildBody(watchSignals, topPicks)
        }
      ]
    });
  }

  private buildBody(watchSignals: StockSignal[], topPicks: StockSignal[]): string {
    const watchline = watchSignals.map((signal) => `${signal.stock.symbol}:${signal.action}`).join(' | ');
    const topline = topPicks.map((signal) => signal.stock.symbol).join(', ');
    return `Watchlist => ${watchline}. Top 5 Buy Picks => ${topline}`;
  }

  private scheduleWebDigest(watchSignals: StockSignal[], topPicks: StockSignal[]): void {
    const now = new Date();
    const nextMorning = new Date();
    nextMorning.setHours(9, 0, 0, 0);
    if (nextMorning <= now) {
      nextMorning.setDate(nextMorning.getDate() + 1);
    }

    const delay = nextMorning.getTime() - now.getTime();
    window.setTimeout(() => {
      this.sendWebDigest(watchSignals, topPicks);
      this.scheduleWebDigest(watchSignals, topPicks);
    }, delay);
  }

  private sendWebDigest(watchSignals: StockSignal[], topPicks: StockSignal[]): void {
    if (!('Notification' in window) || Notification.permission !== 'granted') {
      return;
    }

    new Notification('Daily Stock Watchlist Summary', {
      body: this.buildBody(watchSignals, topPicks)
    });
  }
}

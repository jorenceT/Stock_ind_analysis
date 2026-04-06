import { Injectable } from '@angular/core';
import { StockSignal } from '../models/stock.model';

@Injectable({
  providedIn: 'root'
})
export class NotificationService {
  private timeoutId?: number;

  async requestPermission(): Promise<boolean> {
    if (!('Notification' in window)) {
      return false;
    }

    if (Notification.permission === 'granted') {
      return true;
    }

    const permission = await Notification.requestPermission();
    return permission === 'granted';
  }

  scheduleMorningDigest(watchSignals: StockSignal[], topPicks: StockSignal[]): void {
    if (!('Notification' in window) || Notification.permission !== 'granted') {
      return;
    }

    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
    }

    const now = new Date();
    const nextMorning = new Date();
    nextMorning.setHours(9, 0, 0, 0);
    if (nextMorning <= now) {
      nextMorning.setDate(nextMorning.getDate() + 1);
    }

    const delay = nextMorning.getTime() - now.getTime();
    this.timeoutId = window.setTimeout(() => {
      this.sendDigest(watchSignals, topPicks);
      this.scheduleMorningDigest(watchSignals, topPicks);
    }, delay);
  }

  sendDigest(watchSignals: StockSignal[], topPicks: StockSignal[]): void {
    const watchline = watchSignals
      .map((signal) => `${signal.stock.symbol}:${signal.action}`)
      .join(' | ');

    const topline = topPicks
      .map((signal) => signal.stock.symbol)
      .join(', ');

    new Notification('Daily Stock Watchlist Summary', {
      body: `Watchlist => ${watchline}. Top 5 Buy Picks => ${topline}`
    });
  }
}

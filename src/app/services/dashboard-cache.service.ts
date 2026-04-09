import { Injectable } from '@angular/core';
import { AiStockInsight } from './ai-analysis.service';
import { MarketNewsItem } from './market-news.service';
import { StockSignal } from '../models/stock.model';

export interface DashboardCacheSnapshot {
  savedAt: string;
  watchSignals: StockSignal[];
  suggestedNews: MarketNewsItem[];
  aiSummary: string;
  aiWatchlistInsights: AiStockInsight[];
  aiTopPicks: AiStockInsight[];
  topPicks: StockSignal[];
  message: string;
}

@Injectable({
  providedIn: 'root'
})
export class DashboardCacheService {
  private readonly storageKey = 'indian-stock-dashboard-cache';
  private readonly ttlMs = 5 * 60 * 60 * 1000;

  loadSnapshot(): DashboardCacheSnapshot | null {
    const raw = localStorage.getItem(this.storageKey);
    if (!raw) {
      return null;
    }

    try {
      const parsed = JSON.parse(raw) as DashboardCacheSnapshot;
      if (!parsed.savedAt || !this.isValidSnapshot(parsed)) {
        return null;
      }

      return parsed;
    } catch {
      return null;
    }
  }

  isExpired(savedAt: string): boolean {
    const timestamp = Date.parse(savedAt);
    if (Number.isNaN(timestamp)) {
      return true;
    }

    return Date.now() - timestamp > this.ttlMs;
  }

  saveSnapshot(snapshot: Omit<DashboardCacheSnapshot, 'savedAt'>): void {
    const payload: DashboardCacheSnapshot = {
      ...snapshot,
      savedAt: new Date().toISOString()
    };

    localStorage.setItem(this.storageKey, JSON.stringify(payload));
  }

  clearSnapshot(): void {
    localStorage.removeItem(this.storageKey);
  }

  private isValidSnapshot(snapshot: DashboardCacheSnapshot): boolean {
    return Array.isArray(snapshot.watchSignals) && Array.isArray(snapshot.suggestedNews) && Array.isArray(snapshot.aiWatchlistInsights);
  }
}

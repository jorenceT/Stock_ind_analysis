import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class WatchlistService {
  private readonly storageKey = 'indian-stock-watchlist';

  getWatchlist(): string[] {
    const raw = localStorage.getItem(this.storageKey);
    if (!raw) {
      return ['RELIANCE', 'TCS', 'HDFCBANK'];
    }

    try {
      const parsed = JSON.parse(raw) as string[];
      return parsed;
    } catch {
      return [];
    }
  }

  addToWatchlist(symbol: string): string[] {
    const normalized = symbol.toUpperCase().trim();
    const current = this.getWatchlist();

    if (!current.includes(normalized)) {
      current.push(normalized);
      this.persist(current);
    }

    return current;
  }

  removeFromWatchlist(symbol: string): string[] {
    const normalized = symbol.toUpperCase().trim();
    const updated = this.getWatchlist().filter((item) => item !== normalized);
    this.persist(updated);
    return updated;
  }

  private persist(list: string[]): void {
    localStorage.setItem(this.storageKey, JSON.stringify(list));
  }
}

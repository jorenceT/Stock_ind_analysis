import { Injectable } from '@angular/core';

export interface WatchlistItem {
  symbol: string;
  companyName: string;
}

@Injectable({
  providedIn: 'root'
})
export class WatchlistService {
  private readonly storageKey = 'indian-stock-watchlist';

  getWatchlist(): string[] {
    return this.getWatchlistItems().map((item) => item.symbol);
  }

  getWatchlistItems(): WatchlistItem[] {
    const raw = localStorage.getItem(this.storageKey);
    if (!raw) {
      return [];
    }

    try {
      const parsed = JSON.parse(raw) as Array<string | Partial<WatchlistItem>>;
      return parsed
        .map((item) => {
          if (typeof item === 'string') {
            return {
              symbol: item.toUpperCase().trim(),
              companyName: item.toUpperCase().trim()
            };
          }

          const symbol = item.symbol?.toUpperCase().trim() ?? '';
          if (!symbol) {
            return undefined;
          }

          return {
            symbol,
            companyName: item.companyName?.trim() || symbol
          };
        })
        .filter((item): item is WatchlistItem => Boolean(item));
    } catch {
      return [];
    }
  }

  addToWatchlist(symbol: string, companyName?: string): string[] {
    const normalized = symbol.toUpperCase().trim();
    const current = this.getWatchlistItems();

    if (!current.some((item) => item.symbol === normalized)) {
      current.push({
        symbol: normalized,
        companyName: companyName?.trim() || normalized
      });
      this.persist(current);
    }

    return current.map((item) => item.symbol);
  }

  removeFromWatchlist(symbol: string): string[] {
    const normalized = symbol.toUpperCase().trim();
    const updated = this.getWatchlistItems().filter((item) => item.symbol !== normalized);
    this.persist(updated);
    return updated.map((item) => item.symbol);
  }

  private persist(list: WatchlistItem[]): void {
    localStorage.setItem(this.storageKey, JSON.stringify(list));
  }
}

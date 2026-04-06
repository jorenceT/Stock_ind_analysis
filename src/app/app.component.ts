import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MarketSearchResult } from './models/market-search-result.model';
import { StockSignal } from './models/stock.model';
import { MarketLookupService } from './services/market-lookup.service';
import { NotificationService } from './services/notification.service';
import { SignalService } from './services/signal.service';
import { StockDataService } from './services/stock-data.service';
import { WatchlistService } from './services/watchlist.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent implements OnInit {
  title = 'Indian Stock Morning Advisor';
  addSymbol = '';

  searchResults: MarketSearchResult[] = [];
  searching = false;
  watchSignals: StockSignal[] = [];
  topPicks: StockSignal[] = [];
  message = '';
  private searchTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly stockDataService: StockDataService,
    private readonly watchlistService: WatchlistService,
    private readonly marketLookupService: MarketLookupService,
    private readonly signalService: SignalService,
    private readonly notificationService: NotificationService
  ) {}

  async ngOnInit(): Promise<void> {
    this.refreshData();

    const canNotify = await this.notificationService.requestPermission();
    if (canNotify) {
      this.notificationService.scheduleMorningDigest(this.watchSignals, this.topPicks);
      this.message = 'Daily morning notification scheduled for 9:00 AM.';
    } else {
      this.message = 'Enable browser notifications for daily morning buy/sell alerts.';
    }
  }

  addStock(): void {
    if (!this.addSymbol) {
      return;
    }

    const stock = this.stockDataService.findBySymbol(this.addSymbol);
    if (!stock) {
      void this.addFromLiveLookup(this.addSymbol);
      return;
    }

    this.watchlistService.addToWatchlist(stock.symbol);
    this.addSymbol = '';
    this.searchResults = [];
    this.refreshData();
  }

  onSymbolInput(): void {
    if (this.searchTimer) {
      clearTimeout(this.searchTimer);
    }

    const query = this.addSymbol.trim();
    if (!query) {
      this.searchResults = [];
      return;
    }

    this.searching = true;
    this.searchTimer = setTimeout(() => {
      void this.loadSuggestions(query);
    }, 250);
  }

  selectSuggestion(result: MarketSearchResult): void {
    this.addSymbol = result.symbol;
    this.searchResults = [];
    this.message = `${result.companyName} selected.`;
  }

  removeStock(symbol: string): void {
    this.watchlistService.removeFromWatchlist(symbol);
    this.refreshData();
  }

  sendNow(): void {
    this.notificationService.sendDigest(this.watchSignals, this.topPicks);
    this.message = 'Notification sent now.';
  }

  private refreshData(): void {
    const universe = this.stockDataService.getUniverse();
    const watchlist = this.watchlistService.getWatchlist();

    this.watchSignals = watchlist
      .map((symbol) => universe.find((stock) => stock.symbol === symbol))
      .filter((stock): stock is NonNullable<typeof stock> => Boolean(stock))
      .map((stock) => this.signalService.getSignal(stock));

    this.topPicks = this.signalService.getTopPicks(universe);
    void this.refreshLiveWatchlist(watchlist);
  }

  private async loadSuggestions(query: string): Promise<void> {
    try {
      const results = await this.marketLookupService.searchSymbols(query);
      this.searchResults = results;
      this.message = results.length ? 'Live NSE suggestions loaded.' : 'No NSE matches found yet.';
    } catch (error) {
      this.searchResults = [];
      this.message = error instanceof Error ? error.message : 'Unable to load live suggestions.';
    } finally {
      this.searching = false;
    }
  }

  private async addFromLiveLookup(query: string): Promise<void> {
    try {
      this.message = 'Looking up live NSE symbol...';
      const result = await this.marketLookupService.resolveSymbol(query);
      if (!result) {
        this.message = `No live NSE match found for ${query.toUpperCase()}.`;
        return;
      }

      this.watchlistService.addToWatchlist(result.symbol);
      this.addSymbol = '';
      this.searchResults = [];
      this.message = `${result.companyName} added to your watchlist.`;
      this.refreshData();
    } catch (error) {
      this.message = error instanceof Error ? error.message : 'Unable to add symbol right now.';
    }
  }

  private async refreshLiveWatchlist(watchlist: string[]): Promise<void> {
    const liveSignals = (
      await Promise.all(
        watchlist.map(async (symbol) => {
          const liveStock = await this.marketLookupService.getLiveStock(symbol);
          return liveStock ? this.signalService.getSignal(liveStock) : undefined;
        })
      )
    ).filter((signal): signal is StockSignal => Boolean(signal));

    if (liveSignals.length) {
      this.watchSignals = liveSignals;
    }
  }
}

import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { StockSignal } from './models/stock.model';
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

  allSymbols: string[] = [];
  watchSignals: StockSignal[] = [];
  topPicks: StockSignal[] = [];
  message = '';

  constructor(
    private readonly stockDataService: StockDataService,
    private readonly watchlistService: WatchlistService,
    private readonly signalService: SignalService,
    private readonly notificationService: NotificationService
  ) {}

  async ngOnInit(): Promise<void> {
    this.allSymbols = this.stockDataService.getUniverse().map((stock) => stock.symbol);
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
      this.message = `Stock ${this.addSymbol.toUpperCase()} is not in current sample universe.`;
      return;
    }

    this.watchlistService.addToWatchlist(stock.symbol);
    this.addSymbol = '';
    this.refreshData();
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
  }
}

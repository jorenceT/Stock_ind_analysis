import { Injectable } from '@angular/core';
import { Stock, StockSignal } from '../models/stock.model';

@Injectable({
  providedIn: 'root'
})
export class SignalService {
  getSignal(stock: Stock): StockSignal {
    let score = 0;

    if (stock.currentPrice > stock.movingAverage20) {
      score += 1;
    }

    if (stock.dayChangePercent > 0.7) {
      score += 1;
    }

    if (stock.rsi >= 45 && stock.rsi <= 68) {
      score += 1;
    }

    if (stock.rsi > 73) {
      score -= 1;
    }

    const action = score >= 2 ? 'BUY' : score <= 0 ? 'SELL' : 'HOLD';

    return {
      stock,
      action,
      score,
      reason: this.getReason(action, stock)
    };
  }

  getTopPicks(stocks: Stock[]): StockSignal[] {
    return stocks
      .map((stock) => this.getSignal(stock))
      .filter((signal) => signal.action === 'BUY')
      .sort((a, b) => b.score - a.score || b.stock.dayChangePercent - a.stock.dayChangePercent)
      .slice(0, 5);
  }

  private getReason(action: 'BUY' | 'SELL' | 'HOLD', stock: Stock): string {
    if (action === 'BUY') {
      return `${stock.symbol} is above 20-day average with supportive RSI and momentum.`;
    }

    if (action === 'SELL') {
      return `${stock.symbol} is weak versus 20-day average or RSI trend.`;
    }

    return `${stock.symbol} is neutral. Better to wait for stronger confirmation.`;
  }
}

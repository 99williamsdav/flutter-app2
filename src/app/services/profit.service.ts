import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, forkJoin, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { environment } from '../../environments/environment';

export interface StatsData {
  profit: number | null;
  cashoutValue: number | null;
  expectedProfit: number | null;
  stale: boolean;
}

export interface OpenPosition {
  LongShort: 'Long' | 'Short';
  LongStake: number;
  ShortStake: number;
  AverageProfit: number;
  LayValue: number;
}

export interface ProfitData {
  normalProfit: number | null;
  normalCashout: number | null;
  normalStale: boolean;
  snowballProfit: number | null;
  snowballCashout: number | null;
  snowballStale: boolean;
  inplayProfit: number | null;
  inplayExpected: number | null;
  inplayStale: boolean;
  openStake: number | null;
  lastUpdated: Date | null;
}

@Injectable({
  providedIn: 'root',
})
export class ProfitService {
  private readonly flutterbotBase = environment.flutterbotApiBase;
  private readonly snowballBase = environment.snowballApiBase;

  constructor(private http: HttpClient) {}

  private getToday(): string {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  private fetchStats(baseUrl: string, extraFilter: string): Observable<StatsData> {
    const date = this.getToday();
    const dsFilters = `{${extraFilter}Void: false}`;
    const url = `${baseUrl}/stats?df=${date}&dt=${date}&groupings=["All"]&dsFilters=${dsFilters}&specialFilters={}`;

    return this.http.get<any>(url).pipe(
      map(response => {
        const net = response?.All?.[0]?.Net;
        return {
          profit: net?.Profit ?? null,
          cashoutValue: net?.CashoutValueExclLargeSpread ?? null,
          expectedProfit: net?.ExpectedProfit ?? null,
          stale: false,
        };
      }),
      catchError(() => of({ profit: null, cashoutValue: null, expectedProfit: null, stale: true }))
    );
  }

  private fetchOpenBets(): Observable<number | null> {
    const url = `${this.flutterbotBase}/open`;
    return this.http.get<OpenPosition[]>(url).pipe(
      map(bets => {
        if (!bets || !Array.isArray(bets)) return null;
        return bets.reduce((sum, bet) => {
          return sum + (bet.LongShort === 'Long' ? (bet.LongStake ?? 0) : (bet.ShortStake ?? 0));
        }, 0);
      }),
      catchError(() => of(null))
    );
  }

  fetchAll(): Observable<ProfitData> {
    return forkJoin({
      normal: this.fetchStats(this.flutterbotBase, ''),
      snowball: this.fetchStats(this.snowballBase, ''),
      inplay: this.fetchStats(this.flutterbotBase, 'InPlay: true, '),
      openStake: this.fetchOpenBets(),
    }).pipe(
      map(({ normal, snowball, inplay, openStake }) => ({
        normalProfit: normal.profit,
        normalCashout: normal.cashoutValue,
        normalStale: normal.stale,
        snowballProfit: snowball.profit,
        snowballCashout: snowball.cashoutValue,
        snowballStale: snowball.stale,
        inplayProfit: inplay.profit,
        inplayExpected: inplay.expectedProfit,
        inplayStale: inplay.stale,
        openStake,
        lastUpdated: new Date(),
      }))
    );
  }
}

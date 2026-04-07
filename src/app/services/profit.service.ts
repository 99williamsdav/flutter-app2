import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, forkJoin, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { environment } from '../../environments/environment';

export interface StatsData {
  profit: number | null;
  weekToDateProfit: number | null;
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
  Race: RaceData;
}

export interface RaceData {
  Date: Date | string;
  Venue: string;
  Country: string;
}

export interface ProfitData {
  normalProfit: number | null;
  normalWeekToDateProfit: number | null;
  normalCashout: number | null;
  normalStale: boolean;
  snowballProfit: number | null;
  snowballWeekToDateProfit: number | null;
  snowballCashout: number | null;
  snowballStale: boolean;
  inplayProfit: number | null;
  inplayWeekToDateProfit: number | null;
  inplayExpected: number | null;
  inplayStale: boolean;
  openStake: number | null;
  openAverageProfit: number | null;
  openLayValue: number | null;
  upcomingGBRaces: number;
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

  private getStartOfWeek(): string {
    const now = new Date();
    const mondayBasedDay = (now.getDay() + 6) % 7;
    const start = new Date(now);
    start.setDate(now.getDate() - mondayBasedDay);

    const yyyy = start.getFullYear();
    const mm = String(start.getMonth() + 1).padStart(2, '0');
    const dd = String(start.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  private isRaceToday(raceDate: Date | string | null | undefined): boolean {
    if (!raceDate) {
      return false;
    }

    if (typeof raceDate === 'string') {
      return raceDate.slice(0, 10) === this.getToday();
    }

    const yyyy = raceDate.getFullYear();
    const mm = String(raceDate.getMonth() + 1).padStart(2, '0');
    const dd = String(raceDate.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}` === this.getToday();
  }

  private formatUtcQueryParam(date: Date): string {
    return `${date.toISOString().slice(0, 16)}Z`;
  }

  private fetchStats(baseUrl: string, extraFilter: string, dateFrom: string, dateTo: string): Observable<StatsData> {
    const date = this.getToday();
    const weekStart = this.getStartOfWeek();
    const dsFilters = `{${extraFilter}Void: false}`;
    const url = `${baseUrl}/stats?df=${dateFrom}&dt=${dateTo}&groupings=["All"]&dsFilters=${dsFilters}&specialFilters={}`;
    const weekToDateUrl = `${baseUrl}/stats?df=${weekStart}&dt=${date}&groupings=["All"]&dsFilters=${dsFilters}&specialFilters={}`;

    return forkJoin({
      day: this.http.get<any>(url),
      week: this.http.get<any>(weekToDateUrl),
    }).pipe(
      map(({ day, week }: { day: any; week: any }) => {
        const dayNet = day?.All?.[0]?.Net;
        const weekNet = week?.All?.[0]?.Net;
        return {
          profit: dayNet?.Profit ?? null,
          weekToDateProfit: weekNet?.Profit ?? null,
          cashoutValue: dayNet?.CashoutValueExclLargeSpread ?? null,
          expectedProfit: dayNet?.ExpectedProfit ?? null,
          stale: false,
        };
      }),
      catchError(() =>
        of({ profit: null, weekToDateProfit: null, cashoutValue: null, expectedProfit: null, stale: true })
      )
    );
  }

  private fetchOpenBets(): Observable<{ openStake: number | null; openAverageProfit: number | null; openLayValue: number | null }> {
    const url = `${this.flutterbotBase}/open`;
    return this.http.get<OpenPosition[]>(url).pipe(
      map(bets => {
        if (!bets || !Array.isArray(bets)) {
          return { openStake: null, openAverageProfit: null, openLayValue: null };
        }

        const todaysBets = bets.filter(bet => this.isRaceToday(bet.Race?.Date));

        return todaysBets.reduce(
          (acc, bet) => {
            acc.openStake += bet.LongShort === 'Long' ? (bet.LongStake ?? 0) : (bet.ShortStake ?? 0);
            acc.openAverageProfit += bet.AverageProfit ?? 0;
            acc.openLayValue += bet.LayValue ?? 0;
            return acc;
          },
          { openStake: 0, openAverageProfit: 0, openLayValue: 0 }
        );
      }),
      catchError(() => of({ openStake: null, openAverageProfit: null, openLayValue: null }))
    );
  }

  private fetchUpcomingRaces(): Observable<number> {
    const now = new Date();
    const endOfLocalDay = new Date(now);
    endOfLocalDay.setHours(24, 0, 0, 0);

    const dateFromString = this.formatUtcQueryParam(now);
    const dateToString = this.formatUtcQueryParam(endOfLocalDay);

    const url = `${this.flutterbotBase}/races?df=${encodeURIComponent(dateFromString)}&dt=${encodeURIComponent(dateToString)}`;

    return this.http.get<RaceData[]>(url).pipe(
      map(races => {
        if (!races || !Array.isArray(races)) {
          return 0;
        }
        return races.filter(race => race.Country === 'GB').length;
      }),
      catchError(() => of(0))
    );
  }


  fetchAll(): Observable<ProfitData> {
    const today = this.getToday();
    return forkJoin({
      normal: this.fetchStats(this.flutterbotBase, '', today, today),
      snowball: this.fetchStats(this.snowballBase, '', today, today),
      inplay: this.fetchStats(this.flutterbotBase, 'InPlay: true, ', today, today),
      open: this.fetchOpenBets(),
      upcomingRaces: this.fetchUpcomingRaces(),
    }).pipe(
      map(({ normal, snowball, inplay, open, upcomingRaces }) => ({
        normalProfit: normal.profit,
        normalWeekToDateProfit: normal.weekToDateProfit,
        normalCashout: normal.cashoutValue,
        normalStale: normal.stale,
        snowballProfit: snowball.profit,
        snowballWeekToDateProfit: snowball.weekToDateProfit,
        snowballCashout: snowball.cashoutValue,
        snowballStale: snowball.stale,
        inplayProfit: inplay.profit,
        inplayWeekToDateProfit: inplay.weekToDateProfit,
        inplayExpected: inplay.expectedProfit,
        inplayStale: inplay.stale,
        openStake: open.openStake,
        openAverageProfit: open.openAverageProfit,
        openLayValue: open.openLayValue,
        upcomingGBRaces: upcomingRaces,
        lastUpdated: new Date(),
      }))
    );
  }
}

import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription, forkJoin, interval } from 'rxjs';
import { switchMap, startWith } from 'rxjs/operators';
import {
  IonContent,
  IonCard,
  IonCardHeader,
  IonCardTitle,
  IonCardContent,
  IonRefresher,
  IonRefresherContent,
} from '@ionic/angular/standalone';
import { HourlyProfitPoint, ProfitService, ProfitData } from '../services/profit.service';
import { StreamHealthData, StreamHealthService, StreamHealthSnapshot } from '../services/stream-health.service';
import { FireworksComponent } from './fireworks.component';

@Component({
  selector: 'app-home',
  templateUrl: './home.page.html',
  styleUrls: ['./home.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    IonContent,
    IonCard,
    IonCardHeader,
    IonCardTitle,
    IonCardContent,
    IonRefresher,
    IonRefresherContent,
    FireworksComponent,
  ],
})
export class HomePage implements OnInit, OnDestroy {
  activeView: 'today' | 'week' | 'streamHealth' = 'today';
  showFireworks = false;
  private fireworksShown = false;
  private touchStartX: number | null = null;

  data: ProfitData = {
    normalProfit: null,
    normalWeekToDateProfit: null,
    normalCashout: null,
    normalWeekToDateCashout: null,
    normalHourlyProfit: [],
    normalWeekToDateHourlyProfit: [],
    normalStale: false,
    snowballProfit: null,
    snowballWeekToDateProfit: null,
    snowballCashout: null,
    snowballWeekToDateCashout: null,
    snowballHourlyProfit: [],
    snowballWeekToDateHourlyProfit: [],
    snowballStale: false,
    inplayProfit: null,
    inplayWeekToDateProfit: null,
    inplayExpected: null,
    inplayWeekToDateExpected: null,
    inplayHourlyProfit: [],
    inplayWeekToDateHourlyProfit: [],
    inplayStale: false,
    openStake: null,
    openAverageProfit: null,
    openLayValue: null,
    commissionPaidToday: null,
    commissionPaidThisWeek: null,
    upcomingGBRaces: 0,
    upcomingGBVenues: 0,
    lastUpdated: null,
  };

  todayGrossSparklinePoints: HourlyProfitPoint[] = [];
  weekGrossSparklinePoints: HourlyProfitPoint[] = [];
  todayGrossSparklinePath = '';
  weekGrossSparklinePath = '';
  todayGrossBaselineY: number | null = null;
  weekGrossBaselineY: number | null = null;

  streamHealthData: StreamHealthData = this.emptyStreamHealthData(15);
  streamHealthHourData: StreamHealthData = this.emptyStreamHealthData(60);
  streamHealthThreeHourData: StreamHealthData = this.emptyStreamHealthData(180);
  streamHealthLastUpdated: Date | null = null;

  private pollSub?: Subscription;
  private streamHealthSub?: Subscription;

  constructor(
    private profitService: ProfitService,
    private streamHealthService: StreamHealthService,
  ) {}

  get todayProfitLabel(): string {
    const now = new Date();
    const ukDate = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/London',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);
    const localDate = new Intl.DateTimeFormat('en-GB', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);

    if (ukDate === localDate) {
      return "Today's Profit";
    }

    const weekday = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/London',
      weekday: 'long',
    }).format(now);
    return `${weekday}'s Profit`;
  }

  ngOnInit() {
    this.startPolling();
    this.streamHealthService.startPolling();
    this.streamHealthSub = this.streamHealthService.snapshot$.subscribe(snapshot => {
      if (snapshot) this.applyStreamHealthSnapshot(snapshot);
    });
  }

  ngOnDestroy() {
    this.pollSub?.unsubscribe();
    this.streamHealthSub?.unsubscribe();
  }

  private startPolling() {
    this.pollSub = interval(10000)
      .pipe(
        startWith(0),
        switchMap(() => this.profitService.fetchAll())
      )
      .subscribe(result => {
        this.data = result;
        this.rebuildGrossSparklines();
        if ((this.grossTotal ?? 0) <= 1000) {
          this.fireworksShown = false;
        }
        if (!this.fireworksShown && (this.grossTotal ?? 0) > 1000) {
          this.showFireworks = true;
          this.fireworksShown = true;
        }
      });
  }

  handleRefresh(event: any) {
    forkJoin({
      profit: this.profitService.fetchAll(),
      streamHealth: this.streamHealthService.refresh(),
    }).subscribe(({ profit }) => {
      this.data = profit;
      this.rebuildGrossSparklines();
      event.target.complete();
    });
  }

  private mergeGrossSeries(...seriesList: HourlyProfitPoint[][]): HourlyProfitPoint[] {
    const totalsByBucket = new Map<string, number>();

    for (const series of seriesList) {
      if (!Array.isArray(series)) {
        continue;
      }

      for (const point of series) {
        if (!point?.bucket || typeof point.profit !== 'number') {
          continue;
        }

        totalsByBucket.set(point.bucket, (totalsByBucket.get(point.bucket) ?? 0) + point.profit);
      }
    }

    return [...totalsByBucket.entries()]
      .map(([bucket, profit]) => ({ bucket, profit }))
      .sort((a, b) => Date.parse(a.bucket) - Date.parse(b.bucket));
  }

  private calculateBaselineY(points: HourlyProfitPoint[], height = 28): number | null {
    const values = points
      .map(point => point.profit)
      .filter((value): value is number => typeof value === 'number');

    if (values.length === 0) {
      return null;
    }

    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);

    if (maxValue === minValue) {
      return height / 2;
    }

    if (0 <= minValue) {
      return height;
    }

    if (0 >= maxValue) {
      return 0;
    }

    const ratio = (0 - minValue) / (maxValue - minValue);
    return height - ratio * height;
  }

  private buildSparklinePath(points: HourlyProfitPoint[], width = 100, height = 28): string {
    const validPoints = points
      .map(point => {
        const timestamp = Date.parse(point.bucket);
        if (Number.isNaN(timestamp) || typeof point.profit !== 'number') {
          return null;
        }

        return {
          timestamp,
          profit: point.profit,
        };
      })
      .filter((point): point is { timestamp: number; profit: number } => point !== null)
      .sort((a, b) => a.timestamp - b.timestamp);

    if (validPoints.length < 2) {
      return '';
    }

    const timestamps = validPoints.map(point => point.timestamp);
    const values = validPoints.map(point => point.profit);

    const minTimestamp = Math.min(...timestamps);
    const maxTimestamp = Math.max(...timestamps);
    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);

    const xAt = (timestamp: number): number => {
      if (maxTimestamp === minTimestamp) {
        return 0;
      }

      return ((timestamp - minTimestamp) / (maxTimestamp - minTimestamp)) * width;
    };

    const yAt = (value: number): number => {
      if (maxValue === minValue) {
        return height / 2;
      }

      return height - ((value - minValue) / (maxValue - minValue)) * height;
    };

    const gapThresholdMs = 90 * 60 * 1000;
    let path = '';

    for (let i = 0; i < validPoints.length; i++) {
      const point = validPoints[i];
      const x = xAt(point.timestamp).toFixed(2);
      const y = yAt(point.profit).toFixed(2);

      if (i === 0) {
        path += `M${x} ${y}`;
        continue;
      }

      const previous = validPoints[i - 1];
      const hasLargeGap = point.timestamp - previous.timestamp > gapThresholdMs;

      if (hasLargeGap) {
        path += ` M${x} ${y}`;
      } else {
        path += ` L${x} ${y}`;
      }
    }

    return path;
  }

  private toCumulative(points: HourlyProfitPoint[]): HourlyProfitPoint[] {
    let running = 0;
    return points.map(point => {
      running += point.profit ?? 0;
      return { bucket: point.bucket, profit: running };
    });
  }

  private rebuildGrossSparklines(): void {
    const todayMerged = this.toCumulative(
      this.mergeGrossSeries(
        this.data.normalHourlyProfit,
        this.data.snowballHourlyProfit,
        this.data.inplayHourlyProfit
      )
    );
    const weekMerged = this.toCumulative(
      this.mergeGrossSeries(
        this.data.normalWeekToDateHourlyProfit,
        this.data.snowballWeekToDateHourlyProfit,
        this.data.inplayWeekToDateHourlyProfit
      )
    );

    this.todayGrossSparklinePoints = todayMerged;
    this.weekGrossSparklinePoints = weekMerged;

    this.todayGrossSparklinePath = this.buildSparklinePath(todayMerged);
    this.weekGrossSparklinePath = this.buildSparklinePath(weekMerged);

    this.todayGrossBaselineY = this.calculateBaselineY(todayMerged);
    this.weekGrossBaselineY = this.calculateBaselineY(weekMerged);
  }

  handleTouchStart(event: TouchEvent) {
    this.touchStartX = event.changedTouches[0]?.clientX ?? null;
  }

  handleTouchEnd(event: TouchEvent) {
    const touchEndX = event.changedTouches[0]?.clientX;
    if (this.touchStartX === null || touchEndX === undefined) {
      return;
    }

    const swipeDelta = touchEndX - this.touchStartX;
    const minSwipeDistance = 45;

    if (Math.abs(swipeDelta) < minSwipeDistance) {
      this.touchStartX = null;
      return;
    }

    this.touchStartX = null;

    if (swipeDelta < 0 && this.activeView === 'streamHealth') {
      this.activeView = 'today';
    } else if (swipeDelta < 0 && this.activeView === 'today') {
      this.activeView = 'week';
    } else if (swipeDelta > 0 && this.activeView === 'streamHealth') {
      return;
    } else if (swipeDelta > 0 && this.activeView === 'week') {
      this.activeView = 'today';
    } else if (swipeDelta > 0 && this.activeView === 'today') {
      this.activeView = 'streamHealth';
    }
  }

  formatWholeRate(value: number | null): string {
    return value === null ? '—' : Math.round(value).toLocaleString();
  }

  formatLatency(value: number | null): string {
    if (value === null) return '—';
    if (value >= 1000) return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)} s`;
    return `${Math.round(value)} ms`;
  }

  formatCount(value: number | null): string {
    return value === null ? '—' : value.toLocaleString();
  }

  get immediateFillTotal(): number | null {
    return this.immediateFillTotalFor(this.streamHealthThreeHourData);
  }

  immediateFillTotalFor(data: StreamHealthData): number | null {
    const full = data.betsImmediatelyFullyMatched;
    const partial = data.betsImmediatelyPartiallyMatched;
    const empty = data.betsImmediatelyUnmatched;

    if (full === null || partial === null || empty === null) return null;
    return full + partial + empty;
  }

  immediateFillShare(data: StreamHealthData, value: number | null): number | null {
    const total = this.immediateFillTotalFor(data);
    if (value === null || total === null) return null;
    return total === 0 ? 0 : (value / total) * 100;
  }

  formatPercent(value: number | null): string {
    return value === null ? '—' : `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })}%`;
  }

  formatCurrency(value: number | null, includePositiveSign = false): string {
    if (value === null || value === undefined) return '£--.--';
    const abs = Math.abs(value);
    const formatted = abs.toFixed(2);

    if (value < 0) {
      return `-£${formatted}`;
    }

    if (includePositiveSign && value > 0) {
      return `+£${formatted}`;
    }

    return `£${formatted}`;
  }

  formatTime(date: Date | null): string {
    if (!date) return '--:--';
    const hh = String(date.getHours()).padStart(2, '0');
    const mm = String(date.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  }

  private emptyStreamHealthData(windowMinutes: number): StreamHealthData {
    return {
      updatesPerMinute: null,
      analysesPerMinute: null,
      analysesPerMcmPercent: null,
      analysisLatencyMs: null,
      floatBetsPlaced: null,
      betsImmediatelyFullyMatched: null,
      betsImmediatelyPartiallyMatched: null,
      betsImmediatelyUnmatched: null,
      fillableStakeMatchedPercent: null,
      averageBetFillPercent: null,
      targetAvailablePercent: null,
      windowMinutes,
      unavailable: false,
    };
  }

  private applyStreamHealthSnapshot(snapshot: StreamHealthSnapshot): void {
    this.streamHealthData = snapshot.quarterHour;
    this.streamHealthHourData = snapshot.hour;
    this.streamHealthThreeHourData = snapshot.threeHours;
    this.streamHealthLastUpdated = snapshot.updatedAt;
  }

  get grossTotal(): number | null {
    const p = this.data;
    if (p.normalProfit === null && p.snowballProfit === null && p.inplayProfit === null) return null;
    return (p.normalProfit ?? 0) + (p.snowballProfit ?? 0) + (p.inplayProfit ?? 0);
  }

  get grossWeekToDateTotal(): number | null {
    const p = this.data;
    if (p.normalWeekToDateProfit === null && p.snowballWeekToDateProfit === null && p.inplayWeekToDateProfit === null) return null;
    return (p.normalWeekToDateProfit ?? 0) + (p.snowballWeekToDateProfit ?? 0) + (p.inplayWeekToDateProfit ?? 0);
  }

  get isTodayGrossAmber(): boolean {
    return this.isGrossAmber(this.grossTotal, this.data.commissionPaidToday);
  }

  get isWeekGrossAmber(): boolean {
    return this.isGrossAmber(this.grossWeekToDateTotal, this.data.commissionPaidThisWeek);
  }

  get isLastUpdatedOld(): boolean {
    const lu = this.data?.lastUpdated;
    if (!lu) return true;
    const ts = lu instanceof Date ? lu.getTime() : new Date(lu).getTime();
    return Date.now() - ts > 10 * 60 * 1000;
  }

  private isGrossAmber(totalProfit: number | null, totalCommission: number | null): boolean {
    return (
      totalProfit !== null &&
      totalProfit > 0 &&
      totalCommission !== null &&
      totalCommission > 0 &&
      totalProfit < totalCommission
    );
  }
}

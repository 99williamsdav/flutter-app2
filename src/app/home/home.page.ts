import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription, interval } from 'rxjs';
import { switchMap, startWith } from 'rxjs/operators';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonButtons,
  IonMenuButton,
  IonCard,
  IonCardHeader,
  IonCardTitle,
  IonCardContent,
  IonRefresher,
  IonRefresherContent,
} from '@ionic/angular/standalone';
import { ProfitService, ProfitData } from '../services/profit.service';

@Component({
  selector: 'app-home',
  templateUrl: './home.page.html',
  styleUrls: ['./home.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonButtons,
    IonMenuButton,
    IonCard,
    IonCardHeader,
    IonCardTitle,
    IonCardContent,
    IonRefresher,
    IonRefresherContent,
  ],
})
export class HomePage implements OnInit, OnDestroy {
  activeView: 'today' | 'week' = 'today';
  private touchStartX: number | null = null;

  data: ProfitData = {
    normalProfit: null,
    normalWeekToDateProfit: null,
    normalCashout: null,
    normalWeekToDateCashout: null,
    normalStale: false,
    snowballProfit: null,
    snowballWeekToDateProfit: null,
    snowballCashout: null,
    snowballWeekToDateCashout: null,
    snowballStale: false,
    inplayProfit: null,
    inplayWeekToDateProfit: null,
    inplayExpected: null,
    inplayWeekToDateExpected: null,
    inplayStale: false,
    openStake: null,
    openAverageProfit: null,
    openLayValue: null,
    commissionPaidToday: null,
    commissionPaidThisWeek: null,
    upcomingGBRaces: 0,
    lastUpdated: null,
  };

  private pollSub?: Subscription;

  constructor(private profitService: ProfitService) {}

  ngOnInit() {
    this.startPolling();
  }

  ngOnDestroy() {
    this.pollSub?.unsubscribe();
  }

  private startPolling() {
    this.pollSub = interval(10000)
      .pipe(
        startWith(0),
        switchMap(() => this.profitService.fetchAll())
      )
      .subscribe(result => {
        this.data = result;
      });
  }

  handleRefresh(event: any) {
    this.profitService.fetchAll().subscribe(result => {
      this.data = result;
      event.target.complete();
    });
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

    this.activeView = swipeDelta < 0 ? 'week' : 'today';
    this.touchStartX = null;
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
}

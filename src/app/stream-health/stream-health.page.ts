import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import {
  IonButtons,
  IonCard,
  IonCardContent,
  IonContent,
  IonHeader,
  IonMenuButton,
  IonRefresher,
  IonRefresherContent,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { StreamHealthData, StreamHealthService, StreamHealthSnapshot } from '../services/stream-health.service';

@Component({
  selector: 'app-stream-health',
  templateUrl: './stream-health.page.html',
  styleUrls: ['./stream-health.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    IonButtons,
    IonCard,
    IonCardContent,
    IonContent,
    IonHeader,
    IonMenuButton,
    IonRefresher,
    IonRefresherContent,
    IonTitle,
    IonToolbar,
  ],
})
export class StreamHealthPage implements OnInit, OnDestroy {
  data: StreamHealthData = {
    updatesPerMinute: null,
    analysesPerMinute: null,
    analysesPerMcmPercent: null,
    analysisLatencyMs: null,
    windowMinutes: 15,
    unavailable: false,
  };
  hourData: StreamHealthData = {
    updatesPerMinute: null,
    analysesPerMinute: null,
    analysesPerMcmPercent: null,
    analysisLatencyMs: null,
    windowMinutes: 60,
    unavailable: false,
  };
  lastUpdated: Date | null = null;
  private pollSub?: Subscription;
  private touchStartX: number | null = null;

  constructor(
    private streamHealthService: StreamHealthService,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.streamHealthService.startPolling();
    this.pollSub = this.streamHealthService.snapshot$.subscribe(snapshot => {
      if (snapshot) this.applySnapshot(snapshot);
    });
  }

  ngOnDestroy(): void {
    this.pollSub?.unsubscribe();
  }

  handleRefresh(event: CustomEvent): void {
    this.streamHealthService.refresh().subscribe(() => {
      (event.target as HTMLIonRefresherElement).complete();
    });
  }

  handleTouchStart(event: TouchEvent): void {
    this.touchStartX = event.changedTouches[0]?.clientX ?? null;
  }

  handleTouchEnd(event: TouchEvent): void {
    const touchEndX = event.changedTouches[0]?.clientX;
    if (this.touchStartX === null || touchEndX === undefined) {
      return;
    }

    const swipeDelta = touchEndX - this.touchStartX;
    this.touchStartX = null;

    if (swipeDelta <= -45) {
      void this.router.navigateByUrl('/home');
    }
  }

  formatRate(value: number | null): string {
    return value === null ? '—' : value.toLocaleString(undefined, { maximumFractionDigits: 1 });
  }

  formatLatency(value: number | null): string {
    if (value === null) return '—';
    if (value >= 1000) return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)} s`;
    return `${Math.round(value)} ms`;
  }

  formatPercent(value: number | null): string {
    return value === null ? 'â€”' : `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })}%`;
  }

  formatTime(value: Date | null): string {
    if (!value) return '—';
    return value.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  private applySnapshot(snapshot: StreamHealthSnapshot): void {
    this.data = snapshot.quarterHour;
    this.hourData = snapshot.hour;
    this.lastUpdated = snapshot.updatedAt;
  }
}

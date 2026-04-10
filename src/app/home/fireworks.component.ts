import {
  Component,
  ElementRef,
  EventEmitter,
  OnDestroy,
  AfterViewInit,
  Output,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  alpha: number;
  decay: number;
  color: string;
  radius: number;
}

interface Rocket {
  x: number;
  y: number;
  vy: number;
  targetY: number;
  exploded: boolean;
  particles: Particle[];
  launchTime: number;
}

@Component({
  selector: 'app-fireworks',
  templateUrl: './fireworks.component.html',
  styleUrls: ['./fireworks.component.scss'],
  standalone: true,
  imports: [CommonModule],
})
export class FireworksComponent implements AfterViewInit, OnDestroy {
  @Output() done = new EventEmitter<void>();
  @ViewChild('canvas') canvasRef!: ElementRef<HTMLCanvasElement>;

  private rafId: number | null = null;
  private startTime: number | null = null;
  private rockets: Rocket[] = [];
  private readonly ROCKET_COUNT = 16;
  private readonly TOTAL_DURATION_MS = 10000;

  ngAfterViewInit(): void {
    const canvas = this.canvasRef.nativeElement;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    this.startTime = performance.now();
    this.initRockets(canvas.width, canvas.height);
    this.loop(canvas);
  }

  private initRockets(w: number, h: number): void {
    for (let i = 0; i < this.ROCKET_COUNT; i++) {
      this.rockets.push({
        x: w * (0.1 + Math.random() * 0.8),
        y: h,
        vy: -(h * (0.5 + Math.random() * 0.25)) / 60,
        targetY: h * (0.15 + Math.random() * 0.35),
        exploded: false,
        particles: [],
        launchTime: i < 8 ? 0 : 1000,
      });
    }
  }

  private explode(rocket: Rocket): void {
    const count = 80 + Math.floor(Math.random() * 40);
    const hue = Math.floor(Math.random() * 360);

    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count;
      const speed = 1 + Math.random() * 3.5;
      rocket.particles.push({
        x: rocket.x,
        y: rocket.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        alpha: 1,
        decay: 0.004 + Math.random() * 0.003,
        color: `hsl(${hue + Math.random() * 30 - 15}, 100%, ${55 + Math.random() * 20}%)`,
        radius: 2 + Math.random() * 2,
      });
    }
    rocket.exploded = true;
  }

  private loop(canvas: HTMLCanvasElement): void {
    const ctx = canvas.getContext('2d')!;
    const now = performance.now();
    const elapsed = now - (this.startTime ?? now);

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (let i = 0; i < this.rockets.length; i++) {
      const rocket = this.rockets[i];

      if (elapsed < rocket.launchTime) {
        continue;
      }

      if (!rocket.exploded) {
        rocket.y += rocket.vy;

        // Draw rocket trail dot
        ctx.beginPath();
        ctx.arc(rocket.x, rocket.y, 3, 0, Math.PI * 2);
        ctx.fillStyle = '#fff';
        ctx.fill();

        if (rocket.y <= rocket.targetY) {
          this.explode(rocket);
        }
      } else {
        for (const p of rocket.particles) {
          p.x += p.vx;
          p.y += p.vy;
          p.vy += 0.06; // gravity
          p.vx *= 0.98; // drag
          p.alpha -= p.decay;

          if (p.alpha <= 0) continue;

          ctx.save();
          ctx.globalAlpha = Math.max(0, p.alpha);
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
          ctx.fillStyle = p.color;
          ctx.fill();
          ctx.restore();
        }

        rocket.particles = rocket.particles.filter(p => p.alpha > 0);
      }
    }

    const allDone = elapsed >= this.TOTAL_DURATION_MS &&
      this.rockets.every(r => r.exploded && r.particles.length === 0);

    if (allDone) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      this.done.emit();
      return;
    }

    this.rafId = requestAnimationFrame(() => this.loop(canvas));
  }

  ngOnDestroy(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
    }
  }
}

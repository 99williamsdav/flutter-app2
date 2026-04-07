import { Component, OnInit } from '@angular/core';
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonButtons,
  IonMenuButton,
} from '@ionic/angular/standalone';
import { environment } from '../../environments/environment';

@Component({
  selector: 'app-about',
  templateUrl: './about.page.html',
  styleUrls: ['./about.page.scss'],
  standalone: true,
  imports: [
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonButtons,
    IonMenuButton,
  ],
})
export class AboutPage implements OnInit {
  appVersion = environment.appVersion;
  appBuild = '';

  get versionDisplay(): string {
    return this.appBuild ? `${this.appVersion} (${this.appBuild})` : this.appVersion;
  }

  async ngOnInit(): Promise<void> {
    if (!Capacitor.isNativePlatform()) {
      return;
    }

    try {
      const appInfo = await CapacitorApp.getInfo();
      this.appVersion = appInfo.version || this.appVersion;
      this.appBuild = appInfo.build || this.appBuild;
    } catch {
      // Fallback values are already set from environment for web and error cases.
    }
  }
}

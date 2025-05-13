import { Injectable, NgZone } from "@angular/core";
import { BehaviorSubject } from "rxjs/internal/BehaviorSubject";
import { RcloneService } from "./rclone.service";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { filter, firstValueFrom, take } from "rxjs";

@Injectable({
  providedIn: "root",
})
export class StateService {
  private currentTab = new BehaviorSubject<"mount" | "sync" | "copy" | "jobs">(
    "mount"
  );

  private viewportSettings = {
    maximized: {
      radii: {
        homeBottom: "0px",
        titleBar: "0px",
        tabBarBottom: "0px",
      },
    },
    mobile: {
      radii: {
        homeBottom: "0px",
        titleBar: "16px",
        tabBarBottom: "16px",
      },
    },
    default: {
      radii: {
        homeBottom: "16px",
        titleBar: "16px",
        tabBarBottom: "0px",
      },
    },
  };

  private selectedRemoteSource = new BehaviorSubject<any>(null);
  private _isMobile = new BehaviorSubject<boolean>(window.innerWidth <= 600);
  private _isMaximized = new BehaviorSubject<boolean>(false);

  selectedRemote$ = this.selectedRemoteSource.asObservable();
  currentTab$ = this.currentTab.asObservable();
  isMobile$ = this._isMobile.asObservable();
  isMaximized$ = this._isMaximized.asObservable();

  private appWindow = getCurrentWindow();

  constructor(private rcloneService: RcloneService, private ngZone: NgZone) {
    console.log("Initializing StateService with limited event listeners for macOS compatibility");

    // Only set up simplified window listeners for macOS
    this.updateViewportSettings();

    // Use a throttled event listener for resize events
    let resizeTimeout: any;
    window.addEventListener("resize", () => {
      // Cancel previous timeout
      if (resizeTimeout) {
        clearTimeout(resizeTimeout);
      }

      // Schedule a new update after a delay (debouncing)
      resizeTimeout = setTimeout(() => {
        this.ngZone.run(() => {
          console.log("Window resized, updating UI");
          this._isMobile.next(window.innerWidth <= 600);
          this.updateViewportSettings();
        });
      }, 250); // 250ms throttle
    });
  }

  // Add this new method
  private _showToast$ = new BehaviorSubject<{
    message: string;
    type: "success" | "error";
  } | null>(null);
  showToast$ = this._showToast$.asObservable();

  // Remote deletion listener disabled for better stability on macOS
  private async setupRemoteDeletionListener() {
    console.log("Remote deletion listener disabled for macOS compatibility");
    // Not setting up any listeners for better stability
  }

  // Disabled window event listeners for better stability on macOS
  private async initializeWindowListeners() {
    console.log("Window event listeners disabled for macOS compatibility");
    try {
      // Just do a single initial check without any event listeners
      await this.updateWindowState();
    } catch (error) {
      console.warn("Error in window state check:", error);
    }
  }

  private async updateWindowState() {
    const isMaximized = await this.appWindow.isMaximized();
    this._isMaximized.next(isMaximized);
    this.updateViewportSettings();
  }

  private updateViewportSettings() {
    const isMobile = this._isMobile.value;
    const isMaximized = this._isMaximized.value;

    let settings = this.viewportSettings.default;

    if (isMaximized) {
      settings = this.viewportSettings.maximized;
    } else if (isMobile) {
      settings = this.viewportSettings.mobile;
    }

    // Apply the settings
    document.documentElement.style.setProperty(
      "--home-bottom-radius",
      settings.radii.homeBottom
    );
    document.documentElement.style.setProperty(
      "--title-bar-radius",
      settings.radii.titleBar
    );
    document.documentElement.style.setProperty(
      "--tab-bar-bottom-radius",
      settings.radii.tabBarBottom
    );

    // Update app height
    const height = isMobile
      ? `calc(100vh - ((var(--titlebar-height) + var(--title-bar-padding)) + 48px)`
      : "calc(100vh - (var(--titlebar-height) + var(--title-bar-padding))";

    document.documentElement.style.setProperty("--app-height", height);
  }

  resetSelectedRemote(): void {
    this.selectedRemoteSource.next(null);
  }

  setSelectedRemote(remote: any): void {
    this.selectedRemoteSource.next(remote);
  }

  setTab(tab: "mount" | "sync" | "copy" | "jobs") {
    this.currentTab.next(tab);
  }

  getCurrentTab() {
    // Return the current tab value
    console.log("Current tab:", this.currentTab.value);

    return this.currentTab.value;
  }

  private _isAuthInProgress$ = new BehaviorSubject<boolean>(false);
  private _currentRemoteName$ = new BehaviorSubject<string | null>(null);
  private _isAuthCancelled$ = new BehaviorSubject<boolean>(false);
  private _isEditMode$ = new BehaviorSubject<boolean>(false);
  private _cleanupInProgress$ = new BehaviorSubject<boolean>(false);

  // Store unlisten functions to properly clean up event listeners
  private _unlistenFunctions: Array<() => void> = [];

  isAuthInProgress$ = this._isAuthInProgress$.asObservable();
  isAuthCancelled$ = this._isAuthCancelled$.asObservable();
  currentRemoteName$ = this._currentRemoteName$.asObservable();
  cleanupInProgress$ = this._cleanupInProgress$.asObservable();

  async startAuth(remoteName: string, isEditMode: boolean): Promise<void> {
    if (this._cleanupInProgress$.value) {
      console.log("Waiting for previous cleanup to complete");
      await firstValueFrom(
        this._cleanupInProgress$.pipe(
          filter((inProgress) => !inProgress),
          take(1)
        )
      );
    }

    this._isAuthInProgress$.next(true);
    this._currentRemoteName$.next(remoteName);
    this._isAuthCancelled$.next(false);
    this._isEditMode$.next(isEditMode);
    console.log(
      "Starting auth for remote:",
      remoteName,
      "in edit mode:",
      isEditMode
    );
  }

  async cancelAuth(): Promise<void> {
    if (this._cleanupInProgress$.value) {
      console.log("Cleanup already in progress");
      return;
    }

    this._cleanupInProgress$.next(true);
    try {
      this._isAuthCancelled$.next(true);
      const remoteName = this._currentRemoteName$.value;
      const isEditMode = this._isEditMode$.value;
      console.log(
        "Cancelling auth for remote:",
        remoteName,
        "in edit mode:",
        isEditMode
      );

      await this.rcloneService.quitOAuth();

      if (remoteName && !isEditMode) {
        console.log("Deleting remote:", remoteName);
        console.log(
          "Cancelling auth for remote:",
          remoteName,
          "in edit mode:",
          isEditMode
        );

        try {
          await this.rcloneService.deleteRemote(remoteName);
        } catch (error) {
          console.error("Error deleting remote:", error);
        }
      }
    } finally {
      this.resetAuthState();
      this._cleanupInProgress$.next(false);
    }
  }

  resetAuthState(): void {
    this._isAuthInProgress$.next(false);
    this._currentRemoteName$.next(null);
    this._isAuthCancelled$.next(false);
    this._isEditMode$.next(false);
    console.log("Auth state reset");
  }

  // This method should be called when the component is destroyed
  // to properly clean up all event listeners
  cleanup(): void {
    console.log("Cleaning up event listeners");
    this._unlistenFunctions.forEach(unlisten => unlisten());
    this._unlistenFunctions = [];
  }
}

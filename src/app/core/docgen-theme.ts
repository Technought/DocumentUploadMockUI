import { Injectable, computed, signal } from '@angular/core';

export type DocgenThemeMode = 'dark' | 'light';

const STORAGE_KEY = 'docgen-theme';

/** Reads the saved choice. Dark is the default; storage can be blocked, so never rely on it. */
function savedMode(): DocgenThemeMode {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

/**
 * Dark or light look for the document generation page.
 * The page host carries the mode as `data-theme`; the colours for each mode are in styles.css.
 */
@Injectable({ providedIn: 'root' })
export class DocgenTheme {
  readonly mode = signal<DocgenThemeMode>(savedMode());
  readonly isLight = computed(() => this.mode() === 'light');

  toggle(): void {
    const next: DocgenThemeMode = this.isLight() ? 'dark' : 'light';
    this.mode.set(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // The choice still applies for this visit.
    }
  }
}

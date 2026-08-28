import type { DairyApiBridge } from '../../shared/ipc-contracts';

declare global {
  interface Window {
    dairyApi?: DairyApiBridge;
  }
}

export {};

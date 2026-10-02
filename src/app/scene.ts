import type { PointerHandler } from '../core/input';
import type { Insets } from '../render/stage';

/**
 * A Scene is a room (or the home). Rooms own their canvas drawing and a small
 * DOM layer for chrome; the App owns everything shared: the canvas, the top
 * bar, transitions, audio unlock and the frame loop.
 */
export interface Scene extends PointerHandler {
  readonly id: string;
  /** Tint applied to the shared backdrop; also colours transitions. */
  readonly tint: string;
  /** This scene's DOM chrome, mounted by the App while active. */
  readonly ui: HTMLElement;
  layout(width: number, height: number, safe: Insets): void;
  /** Becoming the active scene (transition is starting). */
  enter(): void;
  /** No longer the active scene (transition is starting). */
  leave(): void;
  update(dt: number): void;
  draw(ctx: CanvasRenderingContext2D): void;
}

/** A tiny live toy drawn on a home card. Lets the home "show, not tell". */
export interface Preview {
  update(dt: number): void;
  /** Draw centred in the given card rect (CSS px). */
  draw(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void;
  /** The card was pressed: react (wobble, giggle). */
  poke(): void;
}

export interface RoomInfo {
  id: string;
  name: string;
  tint: string;
  /** False for rooms that are still asleep (coming later). */
  awake: boolean;
  create?: (nav: RoomNav) => Scene;
  preview: () => Preview;
}

export interface RoomNav {
  go(id: string, origin?: { x: number; y: number }): void;
  home(origin?: { x: number; y: number }): void;
}

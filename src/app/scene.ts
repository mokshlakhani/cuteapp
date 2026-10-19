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
  /**
   * A 3D room's own canvas. Once the room has settled the App shows it over
   * the stage and sets `live`, and the room only renders it instead of
   * copying it onto the stage: Safari stalls on that copy every frame.
   */
  readonly view?: HTMLCanvasElement;
  live?: boolean;
}

/** A tiny live toy drawn on a home card. Lets the home "show, not tell". */
export interface Preview {
  update(dt: number): void;
  /** Draw centred in the given card rect (CSS px). */
  draw(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void;
  /** The card was pressed: react (wobble, giggle). */
  poke(): void;
  /**
   * A 3D toy's own canvas. At rest the home shows it on the card itself and
   * calls `render` instead of `draw`: Safari stalls each time a canvas drawn
   * this frame is copied onto another, so it's only copied in transitions.
   */
  canvas?: HTMLCanvasElement;
  render?(w: number, h: number): void;
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

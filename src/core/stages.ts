/**
 * Building a room in slices.
 *
 * A 3D room takes tens of milliseconds to build: its renderer, reflections,
 * geometry and shaders. Done at once that's several dropped frames, wherever
 * it lands. So a room's build is a generator that yields between its parts
 * (each a few milliseconds at most), and the app spends a slice a frame on it
 * while the player is on the home screen, long before the room is opened.
 * Asking for a room that isn't ready yet still works: the rest is built
 * right then.
 */

import { meter } from './perf';

export type Build = Generator<void, void, void>;

let finishing = false;

/** True while a build is being run to the end at once: nothing may wait for a later frame. */
export const buildingAtOnce = () => finishing;

/** Run a build to its end now. */
export function finish(build: Build) {
  const was = finishing;
  finishing = true;
  try {
    while (!build.next().done);
  } finally {
    finishing = was;
  }
}

/** Something built a slice at a time. */
export interface Job {
  readonly ready: boolean;
  /** Do one slice. True once it's all built. */
  step(): boolean;
}

/** One thing built in slices, made on first need and handed out whole. */
export class Staged<T> implements Job {
  private made: T | null = null;
  private build: Build | null = null;
  private over = false;

  constructor(
    private make: () => T,
    private parts: (t: T) => Build,
  ) {}

  get ready() {
    return this.over;
  }

  /** Do one slice. True once it's all built. */
  step(): boolean {
    if (this.over) return true;
    if (!this.made) {
      this.made = this.make();
      this.build = this.parts(this.made);
      return false;
    }
    if (this.build!.next().done) this.over = true;
    return this.over;
  }

  /** The finished thing, building whatever's left right now. */
  get(): T {
    if (!this.over) {
      if (!this.made) {
        this.made = this.make();
        this.build = this.parts(this.made);
      }
      finish(this.build!);
      this.over = true;
    }
    return this.made!;
  }
}

/** Slices of the pending builds, one a frame, a given job first. */
export class Warmer {
  private queue: { id: string; job: Job }[] = [];
  private slices = new Map<string, number>();

  add(id: string, job: Job) {
    this.queue.push({ id, job });
  }

  /** Put this one at the front of the line. */
  first(id: string) {
    const i = this.queue.findIndex((q) => q.id === id);
    if (i > 0) this.queue.unshift(...this.queue.splice(i, 1));
  }

  get idle() {
    return this.queue.length === 0;
  }

  /** One slice of the job at the front. */
  step() {
    if (!this.queue.length) return;
    const { id, job } = this.queue[0];
    const t0 = meter.start();
    const done = job.step();
    meter.stop('w:' + id + (this.slices.get(id) ?? 0), t0);
    this.slices.set(id, (this.slices.get(id) ?? 0) + 1);
    if (done) this.queue.shift();
  }
}

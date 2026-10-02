import type { Preview, RoomInfo } from './scene';
import { roomTint } from '../design/tokens';
import { MelonRoom } from '../rooms/melon/MelonRoom';
import { melonPreview } from '../rooms/melon/preview';
import { JellyRoom } from '../rooms/jelly/JellyRoom';
import { jellyPreview } from '../rooms/jelly/preview';

/** Placeholder previews for rooms that are still asleep. */
const sleeping = (): Preview => ({ update() {}, draw() {}, poke() {} });

/**
 * The room registry. Adding a toy = adding one entry here with a Scene
 * factory and a tiny live preview for its home card. Everything else
 * (navigation, transitions, chrome, sound, haptics) is inherited.
 */
export const ROOMS: RoomInfo[] = [
  { id: 'melon', name: 'pop', tint: roomTint.melon, awake: true, create: (nav) => new MelonRoom(nav), preview: melonPreview },
  { id: 'jelly', name: 'jelly', tint: roomTint.jelly, awake: true, create: (nav) => new JellyRoom(nav), preview: jellyPreview },
  { id: 'soon1', name: 'soon', tint: roomTint.soon1, awake: false, preview: sleeping },
  { id: 'soon2', name: 'soon', tint: roomTint.soon2, awake: false, preview: sleeping },
  { id: 'soon3', name: 'soon', tint: roomTint.soon3, awake: false, preview: sleeping },
];

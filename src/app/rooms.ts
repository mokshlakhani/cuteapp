import type { Preview, RoomInfo } from './scene';
import { roomTint } from '../design/tokens';
import { MelonRoom } from '../rooms/melon/MelonRoom';
import { melonPreview } from '../rooms/melon/preview';
import { JellyRoom } from '../rooms/jelly/JellyRoom';
import { jellyPreview } from '../rooms/jelly/preview';
import { WrapRoom } from '../rooms/wrap/WrapRoom';
import { wrapPreview } from '../rooms/wrap/preview';
import { PourRoom } from '../rooms/pour/PourRoom';
import { pourPreview } from '../rooms/pour/preview';

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
  { id: 'wrap', name: 'bubbles', tint: roomTint.wrap, awake: true, create: (nav) => new WrapRoom(nav), preview: wrapPreview },
  { id: 'pour', name: 'pour', tint: roomTint.pour, awake: true, create: (nav) => new PourRoom(nav), preview: pourPreview },
  { id: 'soon3', name: 'soon', tint: roomTint.soon3, awake: false, preview: sleeping },
];

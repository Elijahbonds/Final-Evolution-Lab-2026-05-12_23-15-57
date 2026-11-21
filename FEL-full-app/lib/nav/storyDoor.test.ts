// lane/story (2026-11-21; owner 2026-10-20 "Adventure REPLACES Story", 2026-11-21 "Make sure the story ... is finished"): the Play tab's
// Story door opens the Adventure's story, and NEXT_PUBLIC_STORY_DOOR=nexus puts it back on The Nexus Initiative.
import { describe, expect, it } from 'vitest';
import { DOORS, STORY_DOOR_ADVENTURE, STORY_DOOR_NEXUS, doorsFor, storyDoorHref } from './doors';

describe('the Play tab\'s Story door', () => {
  it('opens the Adventure\'s story by default', () => {
    expect(storyDoorHref({})).toBe('/play/adventure');
    expect(STORY_DOOR_ADVENTURE).toBe('/play/adventure');
    const story = doorsFor('play').filter((d) => d.label === 'Story');
    expect(story).toEqual([{ href: '/play/adventure', label: 'Story', tab: 'play' }]);
  });
  it('NEXT_PUBLIC_STORY_DOOR=nexus restores The Nexus Initiative door (/story); any other value keeps the Adventure', () => {
    expect(storyDoorHref({ NEXT_PUBLIC_STORY_DOOR: 'nexus' })).toBe(STORY_DOOR_NEXUS);
    expect(STORY_DOOR_NEXUS).toBe('/story');
    expect(storyDoorHref({ NEXT_PUBLIC_STORY_DOOR: 'adventure' })).toBe('/play/adventure');
    expect(storyDoorHref({ NEXT_PUBLIC_STORY_DOOR: '' })).toBe('/play/adventure');
  });
  it('there is one Story door, and every other Play door is where it was', () => {
    expect(DOORS.filter((d) => d.label === 'Story')).toHaveLength(1);
    expect(doorsFor('play').map((d) => d.label)).toEqual(['Venues', 'Arena', 'Ladder', 'Story', 'Big screen', 'Join a game', 'Party chat', 'All modes']);
  });
});

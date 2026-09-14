import type { SteamFriend } from "../lib/api";

/** In game, online (busy and away included), offline; by name within each. */
export function groupFriends(friends: SteamFriend[]) {
  const byName = (a: SteamFriend, b: SteamFriend) => a.name.localeCompare(b.name);
  return {
    playing: friends.filter((friend) => friend.game !== null).sort(byName),
    online: friends
      .filter((friend) => friend.game === null && friend.state > 0)
      .sort(byName),
    offline: friends.filter((friend) => friend.game === null && friend.state === 0).sort(byName),
  };
}

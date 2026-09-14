import { useCallback, useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { PlatformIcon } from "../components/PlatformIcon";
import { Skeleton } from "../components/Skeleton";
import {
  accounts,
  steamFriends,
  steamSignIn,
  steamSignOut,
  type FriendsAnswer,
  type SteamFriend,
  type SteamProfile,
} from "../lib/api";
import { groupFriends } from "./groups";

/**
 * Friends change by the minute, but this is a side window: every two minutes,
 * plus whenever it comes back into focus, is as fresh as anyone looks.
 */
const REFRESH_MS = 120_000;

function Avatar({ friend }: { friend: SteamFriend }) {
  const ring =
    friend.game !== null
      ? "ring-[#90ba3c]"
      : friend.state > 0
        ? "ring-accent"
        : "ring-surface-3";
  return friend.avatar ? (
    <img
      src={friend.avatar}
      alt=""
      draggable={false}
      className={`size-8 shrink-0 rounded-md ring-2 ${ring} ${friend.state === 0 ? "opacity-60 grayscale" : ""}`}
    />
  ) : (
    <span className={`size-8 shrink-0 rounded-md bg-surface-3 ring-2 ${ring}`} />
  );
}

/** Steam's own words for a status that is not plain "online". */
function statusLabel(friend: SteamFriend): string {
  if (friend.game) return friend.game;
  switch (friend.state) {
    case 0:
      return "Hors ligne";
    case 2:
      return "Occupé";
    case 3:
    case 4:
      return "Absent";
    default:
      return "En ligne";
  }
}

function FriendRow({ friend }: { friend: SteamFriend }) {
  return (
    <li className="flex items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-surface-2">
      <Avatar friend={friend} />
      <span className="flex min-w-0 flex-col">
        <span
          className={`truncate text-[13px] ${friend.state === 0 ? "text-ink-muted" : "text-ink"}`}
        >
          {friend.name}
        </span>
        <span
          className={`truncate text-[11px] ${friend.game ? "text-[#90ba3c]" : "text-ink-faint"}`}
        >
          {statusLabel(friend)}
        </span>
      </span>
    </li>
  );
}

function Section({ title, friends }: { title: string; friends: SteamFriend[] }) {
  if (friends.length === 0) return null;
  return (
    <section className="flex flex-col gap-0.5">
      <h3 className="px-2 pt-2 pb-1 text-[10px] tracking-widest text-ink-faint uppercase">
        {title} — {friends.length}
      </h3>
      <ul className="flex flex-col">
        {friends.map((friend) => (
          <FriendRow key={friend.id} friend={friend} />
        ))}
      </ul>
    </section>
  );
}

function SignInPanel({
  busy,
  error,
  onSignIn,
}: {
  busy: boolean;
  error: string | null;
  onSignIn: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
      <span className="text-[#66c0f4]">
        <PlatformIcon platform="steam" className="size-10" />
      </span>
      <p className="text-sm text-ink">Voyez qui est en ligne et à quoi ils jouent.</p>
      <button
        type="button"
        onClick={onSignIn}
        disabled={busy}
        className="flex items-center gap-2 rounded-md bg-[#1b2838] px-4 py-2 text-sm font-semibold text-ink transition hover:bg-[#2a475e] disabled:opacity-50"
      >
        <PlatformIcon platform="steam" className="size-4" />
        {busy ? "Connexion…" : "Se connecter avec Steam"}
      </button>
      <p className="text-[11px] leading-snug text-ink-faint">
        La connexion se fait sur la page officielle de Steam : G-Lib ne voit
        jamais votre mot de passe.
      </p>
      {error && <p className="text-[11px] text-[#ff6b4a]">{error}</p>}
    </div>
  );
}

export function FriendsWindow() {
  // undefined while the stored sign-in is being read.
  const [steam, setSteam] = useState<SteamProfile | null | undefined>(undefined);
  const [answer, setAnswer] = useState<FriendsAnswer | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const readAccounts = useCallback(() => {
    void accounts().then((found) => setSteam(found.steam));
  }, []);

  const load = useCallback(() => {
    void steamFriends().then(setAnswer);
  }, []);

  useEffect(() => {
    readAccounts();
    const stop = listen("accounts-changed", readAccounts);
    return () => void stop.then((off) => off());
  }, [readAccounts]);

  useEffect(() => {
    if (!steam) {
      setAnswer(null);
      return;
    }
    load();
    const timer = setInterval(load, REFRESH_MS);
    window.addEventListener("focus", load);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", load);
    };
  }, [steam, load]);

  const signIn = async () => {
    setBusy(true);
    setError(null);
    try {
      setSteam(await steamSignIn());
    } catch (cause) {
      const message = String(cause);
      if (message !== "cancelled") setError(message);
    } finally {
      setBusy(false);
    }
  };

  if (steam === undefined) {
    return <div className="h-screen bg-surface-0" />;
  }

  return (
    <div className="flex h-screen flex-col bg-surface-0 text-ink">
      {steam ? (
        <>
          <header className="flex items-center gap-2.5 border-b border-line px-3 py-2.5">
            {steam.avatar ? (
              <img src={steam.avatar} alt="" className="size-9 rounded-md" />
            ) : (
              <span className="size-9 rounded-md bg-surface-3" />
            )}
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm font-semibold">{steam.name}</span>
              <span className="flex items-center gap-1 text-[11px] text-ink-faint">
                <PlatformIcon platform="steam" className="size-3" /> Steam
              </span>
            </span>
            <button
              type="button"
              onClick={() => void steamSignOut()}
              title="Se déconnecter de Steam"
              className="rounded-md px-2 py-1 text-[11px] text-ink-faint transition hover:bg-surface-2 hover:text-ink"
            >
              Déconnexion
            </button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-3">
            {answer === null ? (
              <div className="flex flex-col gap-3 p-2">
                {Array.from({ length: 8 }, (_, index) => (
                  <div key={index} className="flex items-center gap-2.5">
                    <Skeleton className="size-8 rounded-md" />
                    <div className="flex flex-1 flex-col gap-1.5">
                      <Skeleton className="h-3 w-2/3" />
                      <Skeleton className="h-2.5 w-1/3" />
                    </div>
                  </div>
                ))}
              </div>
            ) : answer.status === "unavailable" ? (
              <p className="p-4 text-center text-xs text-ink-faint">
                Amis indisponibles pour l'instant. {answer.message}
              </p>
            ) : answer.status === "signedOut" ? null : answer.visibility === "private" ? (
              <p className="p-4 text-center text-xs leading-relaxed text-ink-faint">
                Votre liste d'amis Steam est privée. Rendez-la publique dans
                Steam, Profil → Modifier le profil → Confidentialité, pour la
                voir ici.
              </p>
            ) : answer.friends.length === 0 ? (
              <p className="p-4 text-center text-xs text-ink-faint">
                Aucun ami sur ce compte Steam.
              </p>
            ) : (
              (() => {
                const groups = groupFriends(answer.friends);
                return (
                  <>
                    <Section title="En jeu" friends={groups.playing} />
                    <Section title="En ligne" friends={groups.online} />
                    <Section title="Hors ligne" friends={groups.offline} />
                  </>
                );
              })()
            )}
          </div>

          <footer className="border-t border-line px-3 py-2 text-[11px] text-ink-faint">
            Epic Games — bientôt
          </footer>
        </>
      ) : (
        <SignInPanel busy={busy} error={error} onSignIn={() => void signIn()} />
      )}
    </div>
  );
}

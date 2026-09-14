import { useCallback, useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { LogoMark } from "../components/LogoMark";
import { PlatformIcon } from "../components/PlatformIcon";
import { Skeleton } from "../components/Skeleton";
import { ControlIcon } from "../components/TitleBar";
import {
  accounts,
  epicFriends,
  epicSignIn,
  epicSignOut,
  steamFriends,
  steamSignIn,
  steamSignOut,
  type EpicFriendsAnswer,
  type EpicProfile,
  type FriendsAnswer,
  type SteamFriend,
  type SteamProfile,
} from "../lib/api";
import { PLATFORM_COLORS } from "../types";
import { groupFriends } from "./groups";

/**
 * Friends change by the minute, but this is a side window: every two minutes,
 * plus whenever it comes back into focus, is as fresh as anyone looks.
 */
const REFRESH_MS = 120_000;

type Tab = "steam" | "epic";

/**
 * Epic sign-in is written but not switched on: the relay needs an Epic Account
 * Services application, which needs a verified domain. Until then the window
 * shows Steam alone rather than a tab that leads to an error page.
 */
const EPIC_ENABLED = false;

/**
 * The library's title bar, cut down: this window only minimizes and closes.
 * Dragging and the buttons behave as they do in the main window.
 */
function WindowBar() {
  const win = () => getCurrentWindow();
  return (
    <header
      data-tauri-drag-region
      className="flex h-8 shrink-0 items-center justify-between border-b border-line bg-surface-1 pl-2.5 select-none"
    >
      <span
        data-tauri-drag-region
        className="pointer-events-none flex items-center gap-1.5"
      >
        <LogoMark className="h-[18px] w-auto text-ink-muted" />
        <span className="font-display text-[13px] leading-none font-semibold tracking-tight text-ink-muted">
          Amis
        </span>
      </span>
      <span data-tauri-drag-region className="h-full flex-1" />
      <div className="flex h-full items-center">
        <button
          type="button"
          onClick={() => void win().minimize()}
          aria-label="Réduire"
          className="flex h-8 w-11 items-center justify-center text-ink-muted transition hover:bg-surface-3 hover:text-ink"
        >
          <ControlIcon shape="min" />
        </button>
        <button
          type="button"
          onClick={() => void win().close()}
          aria-label="Fermer"
          className="flex h-8 w-11 items-center justify-center text-ink-muted transition hover:bg-[#c42b1c] hover:text-white"
        >
          <ControlIcon shape="close" />
        </button>
      </div>
    </header>
  );
}

function Tabs({
  tab,
  onTab,
  signedIn,
}: {
  tab: Tab;
  onTab: (tab: Tab) => void;
  signedIn: Record<Tab, boolean>;
}) {
  const options: { id: Tab; label: string }[] = [
    { id: "steam", label: "Steam" },
    { id: "epic", label: "Epic Games" },
  ];
  return (
    <nav className="flex shrink-0 border-b border-line">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          onClick={() => onTab(option.id)}
          aria-pressed={tab === option.id}
          className={`flex flex-1 items-center justify-center gap-2 border-b-2 py-2 text-xs transition ${
            tab === option.id
              ? "border-accent text-ink"
              : "border-transparent text-ink-muted hover:text-ink"
          }`}
        >
          <span style={{ color: PLATFORM_COLORS[option.id] }}>
            <PlatformIcon platform={option.id} className="size-3.5" />
          </span>
          {option.label}
          {signedIn[option.id] && (
            <span className="size-1.5 rounded-full bg-[#23a55a]" aria-label="connecté" />
          )}
        </button>
      ))}
    </nav>
  );
}

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

function ListSkeleton() {
  return (
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
  );
}

const Note = ({ children }: { children: React.ReactNode }) => (
  <p className="p-4 text-center text-xs leading-relaxed text-ink-faint">{children}</p>
);

function SignInPanel({
  platform,
  pitch,
  busy,
  error,
  onSignIn,
}: {
  platform: Tab;
  pitch: string;
  busy: boolean;
  error: string | null;
  onSignIn: () => void;
}) {
  const label = platform === "steam" ? "Steam" : "Epic Games";
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
      <span style={{ color: PLATFORM_COLORS[platform] }}>
        <PlatformIcon platform={platform} className="size-10" />
      </span>
      <p className="text-sm text-ink">{pitch}</p>
      <button
        type="button"
        onClick={onSignIn}
        disabled={busy}
        className="flex items-center gap-2 rounded-md border border-line bg-surface-2 px-4 py-2 text-sm font-semibold text-ink transition hover:border-accent disabled:opacity-50"
      >
        <PlatformIcon platform={platform} className="size-4" />
        {busy ? "Connexion…" : `Se connecter avec ${label}`}
      </button>
      <p className="text-[11px] leading-snug text-ink-faint">
        La connexion se fait sur la page officielle de {label}, dans une fenêtre
        privée : G-Lib ne voit jamais votre mot de passe.
      </p>
      {error && <p className="text-[11px] text-[#ff6b4a]">{error}</p>}
    </div>
  );
}

function AccountHeader({
  platform,
  name,
  avatar,
  onSignOut,
}: {
  platform: Tab;
  name: string;
  avatar: string | null;
  onSignOut: () => void;
}) {
  const label = platform === "steam" ? "Steam" : "Epic Games";
  return (
    <header className="flex items-center gap-2.5 border-b border-line px-3 py-2.5">
      {avatar ? (
        <img src={avatar} alt="" className="size-9 rounded-md" />
      ) : (
        <span
          className="flex size-9 items-center justify-center rounded-md bg-surface-2"
          style={{ color: PLATFORM_COLORS[platform] }}
        >
          <PlatformIcon platform={platform} className="size-5" />
        </span>
      )}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-semibold">{name}</span>
        <span className="text-[11px] text-ink-faint">{label}</span>
      </span>
      <button
        type="button"
        onClick={onSignOut}
        title={`Se déconnecter de ${label}`}
        className="rounded-md px-2 py-1 text-[11px] text-ink-faint transition hover:bg-surface-2 hover:text-ink"
      >
        Déconnexion
      </button>
    </header>
  );
}

/** Refreshes `load` while `active`, on a timer and when the window returns. */
function usePolling(active: boolean, load: () => void) {
  useEffect(() => {
    if (!active) return;
    load();
    const timer = setInterval(load, REFRESH_MS);
    window.addEventListener("focus", load);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", load);
    };
  }, [active, load]);
}

/** Sign-in state shared by both tabs: busy flag, error, "cancelled" ignored. */
function useSignIn<T>(signIn: () => Promise<T>, onDone: (value: T) => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      onDone(await signIn());
    } catch (cause) {
      const message = String(cause);
      if (message !== "cancelled") setError(message);
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, run };
}

export function FriendsWindow() {
  const [tab, setTab] = useState<Tab>("steam");
  // undefined while the stored sign-ins are being read.
  const [steam, setSteam] = useState<SteamProfile | null | undefined>(undefined);
  const [epic, setEpic] = useState<EpicProfile | null | undefined>(undefined);
  const [steamAnswer, setSteamAnswer] = useState<FriendsAnswer | null>(null);
  const [epicAnswer, setEpicAnswer] = useState<EpicFriendsAnswer | null>(null);

  const readAccounts = useCallback(() => {
    void accounts().then((found) => {
      setSteam(found.steam);
      setEpic(found.epic);
      if (!found.steam) setSteamAnswer(null);
      if (!found.epic) setEpicAnswer(null);
    });
  }, []);

  useEffect(() => {
    readAccounts();
    const stop = listen("accounts-changed", readAccounts);
    return () => void stop.then((off) => off());
  }, [readAccounts]);

  const loadSteam = useCallback(() => void steamFriends().then(setSteamAnswer), []);
  const loadEpic = useCallback(() => void epicFriends().then(setEpicAnswer), []);
  usePolling(Boolean(steam), loadSteam);
  usePolling(EPIC_ENABLED && Boolean(epic), loadEpic);

  const steamSign = useSignIn(steamSignIn, setSteam);
  const epicSign = useSignIn(epicSignIn, setEpic);

  const loading = steam === undefined || epic === undefined;

  return (
    <div className="flex h-screen flex-col bg-surface-0 text-ink">
      <WindowBar />
      {EPIC_ENABLED && (
        <Tabs
          tab={tab}
          onTab={setTab}
          signedIn={{ steam: Boolean(steam), epic: Boolean(epic) }}
        />
      )}

      {loading ? null : tab === "steam" || !EPIC_ENABLED ? (
        steam ? (
          <>
            <AccountHeader
              platform="steam"
              name={steam.name}
              avatar={steam.avatar}
              onSignOut={() => void steamSignOut()}
            />
            <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-3">
              {steamAnswer === null ? (
                <ListSkeleton />
              ) : steamAnswer.status === "unavailable" ? (
                <Note>Amis indisponibles pour l'instant. {steamAnswer.message}</Note>
              ) : steamAnswer.status === "signedOut" ? null : steamAnswer.visibility ===
                "private" ? (
                <Note>
                  Votre liste d'amis Steam est privée. Rendez-la publique dans
                  Steam, Profil → Modifier le profil → Confidentialité, pour la
                  voir ici.
                </Note>
              ) : steamAnswer.friends.length === 0 ? (
                <Note>Aucun ami sur ce compte Steam.</Note>
              ) : (
                (() => {
                  const groups = groupFriends(steamAnswer.friends);
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
          </>
        ) : (
          <SignInPanel
            platform="steam"
            pitch="Voyez qui est en ligne et à quoi ils jouent."
            busy={steamSign.busy}
            error={steamSign.error}
            onSignIn={() => void steamSign.run()}
          />
        )
      ) : epic ? (
        <>
          <AccountHeader
            platform="epic"
            name={epic.name}
            avatar={null}
            onSignOut={() => void epicSignOut()}
          />
          <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-3">
            {epicAnswer === null ? (
              <ListSkeleton />
            ) : epicAnswer.status === "unavailable" ? (
              <Note>Amis indisponibles pour l'instant. {epicAnswer.message}</Note>
            ) : epicAnswer.status === "signedOut" ? null : epicAnswer.friends.length === 0 ? (
              <Note>Aucun ami sur ce compte Epic Games.</Note>
            ) : (
              <section className="flex flex-col gap-0.5">
                <h3 className="px-2 pt-2 pb-1 text-[10px] tracking-widest text-ink-faint uppercase">
                  Amis — {epicAnswer.friends.length}
                </h3>
                <ul className="flex flex-col">
                  {epicAnswer.friends.map((friend) => (
                    <li
                      key={friend.id}
                      className="flex items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-surface-2"
                    >
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-surface-2 text-[13px] font-semibold text-ink-muted">
                        {friend.name.slice(0, 1).toUpperCase()}
                      </span>
                      <span className="truncate text-[13px] text-ink">{friend.name}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
          {/* Said once, at the bottom, rather than an "offline" on every row
              that would be wrong for most of them. */}
          <footer className="border-t border-line px-3 py-2 text-[11px] leading-snug text-ink-faint">
            Epic ne partage pas le statut en ligne de vos amis avec les
            applications tierces.
          </footer>
        </>
      ) : (
        <SignInPanel
          platform="epic"
          pitch="Retrouvez votre liste d'amis Epic Games."
          busy={epicSign.busy}
          error={epicSign.error}
          onSignIn={() => void epicSign.run()}
        />
      )}
    </div>
  );
}

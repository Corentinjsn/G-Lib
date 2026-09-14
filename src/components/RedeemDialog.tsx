import { useEffect, useRef, useState } from "react";
import { guessStore, looksLikeKey, normalizeKey } from "../lib/activation";
import { PLATFORM_COLORS, PLATFORM_LABELS, type Platform } from "../types";
import { PlatformIcon } from "./PlatformIcon";

interface Props {
  /** True while the library is being watched for the key's game. */
  watching: boolean;
  onClose: () => void;
  /** Copy is done; open the store and start watching. False if it could not
      be opened, in which case the caller has already said why. */
  onRedeem: (store: Platform) => Promise<boolean>;
}

const STORES: Platform[] = ["steam", "epic", "ea", "ubisoft"];

/** What to do once the store is open, in the store's own words. */
const NEXT_STEP: Record<Platform, string> = {
  steam: "Dans la fenêtre « Activer un produit » de Steam, collez la clé (Ctrl+V).",
  epic: "Sur la page « Utiliser un code » d'Epic, collez la clé (Ctrl+V).",
  ea: "Sur la page « Utiliser un code » d'EA, collez la clé (Ctrl+V).",
  ubisoft:
    "Dans Ubisoft Connect, cliquez sur l'icône de clé en haut à droite, puis collez la clé (Ctrl+V).",
};

/**
 * Put the key where it goes, a little faster than by hand.
 *
 * G-Lib cannot activate a key itself: no store lets an application do that,
 * rightly. It does the rest -- recognises the store, copies the key, opens the
 * right window -- and then watches the library so the game shows up without a
 * manual sync.
 */
export function RedeemDialog({ watching, onClose, onRedeem }: Props) {
  const [raw, setRaw] = useState("");
  // The guess until the user chooses; their choice from then on.
  const [picked, setPicked] = useState<Platform | null>(null);
  const [opened, setOpened] = useState<Platform | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => input.current?.focus(), []);

  const key = normalizeKey(raw);
  const guessed = guessStore(raw);
  const store = picked ?? guessed;
  const ready = looksLikeKey(raw) && store !== null && !busy;

  const submit = async () => {
    if (!ready || !store) return;
    setBusy(true);
    try {
      await copy(key);
      if (await onRedeem(store)) setOpened(store);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="flex w-[26rem] flex-col gap-4 rounded-lg border border-line bg-surface-1 p-4 shadow-2xl shadow-black/70"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape") onClose();
        }}
      >
        <h2 className="text-sm font-semibold text-ink">Activer une clé</h2>

        <input
          ref={input}
          value={raw}
          onChange={(event) => {
            setRaw(event.target.value);
            setOpened(null);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") void submit();
          }}
          placeholder="XXXXX-XXXXX-XXXXX"
          spellCheck={false}
          autoComplete="off"
          className="w-full rounded-md border border-line bg-surface-2 px-3 py-2 font-mono text-sm tracking-wider text-ink uppercase placeholder:text-ink-faint placeholder:normal-case focus:border-accent focus:outline-none"
        />

        <div className="flex flex-col gap-2">
          <span className="text-[11px] text-ink-faint">
            {guessed && !picked
              ? `Ressemble à une clé ${PLATFORM_LABELS[guessed]}.`
              : "Sur quelle boutique ?"}
          </span>
          <div className="grid grid-cols-4 gap-2">
            {STORES.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => {
                  setPicked(option);
                  setOpened(null);
                }}
                aria-pressed={store === option}
                className={`flex flex-col items-center gap-1.5 rounded-md border px-2 py-2.5 text-[11px] transition ${
                  store === option
                    ? "border-accent bg-surface-2 text-ink"
                    : "border-line text-ink-muted hover:border-ink-faint hover:text-ink"
                }`}
              >
                <span style={{ color: PLATFORM_COLORS[option] }}>
                  <PlatformIcon platform={option} className="size-5" />
                </span>
                {PLATFORM_LABELS[option]}
              </button>
            ))}
          </div>
        </div>

        {opened && (
          <div className="flex flex-col gap-1.5 rounded-md bg-surface-2 px-3 py-2.5 text-xs leading-relaxed">
            <span className="text-ink">Clé copiée. {NEXT_STEP[opened]}</span>
            {watching && (
              <span className="flex items-center gap-2 text-ink-faint">
                <span className="inline-block size-1.5 animate-pulse rounded-full bg-accent" />
                G-Lib surveille votre bibliothèque et vous préviendra dès que le
                jeu arrive.
              </span>
            )}
          </div>
        )}

        <p className="text-[11px] leading-snug text-ink-faint">
          Aucune boutique n'accepte une clé venue d'une autre application : G-Lib
          la copie et ouvre la bonne fenêtre, l'activation se fait chez la
          boutique.
        </p>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-sm text-ink-muted transition hover:text-ink"
          >
            Fermer
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={!ready}
            className="rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-surface-0 transition hover:brightness-110 disabled:opacity-40"
          >
            {store
              ? `Copier et ouvrir ${PLATFORM_LABELS[store]}`
              : "Copier et ouvrir"}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * The clipboard API wants a user gesture and a focused document, both true on
 * a click here; the old command is the fallback if the webview says no.
 */
async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    document.execCommand("copy");
    area.remove();
  }
}

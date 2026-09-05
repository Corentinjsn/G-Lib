export type StepState = "pending" | "active" | "done";

export interface SplashStep {
  label: string;
  state: StepState;
}

export interface SplashUpdate {
  version: string | null;
  /** 0 to 1. Stays at 0 until the server reports a content length. */
  progress: number;
}

function Marker({ state }: { state: StepState }) {
  if (state === "done") {
    return <span className="text-accent">✓</span>;
  }
  if (state === "active") {
    return (
      <span className="inline-block size-2.5 animate-pulse rounded-full bg-accent" />
    );
  }
  return <span className="inline-block size-2.5 rounded-full bg-surface-3" />;
}

/**
 * Covers the window until there is a library to show.
 *
 * It reports what is happening rather than spinning blankly: the first run
 * resolves a few hundred appids against the store, and an update installs
 * itself here — both take long enough to look like a hang.
 */
export function Splash({
  steps,
  update,
}: {
  steps: SplashStep[];
  update?: SplashUpdate;
}) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-8 bg-surface-0">
      <div className="flex flex-col items-center gap-2">
        <img
          src="/GAMLIB.png"
          alt=""
          draggable={false}
          className="size-20 object-contain"
        />
        <h1 className="font-display text-4xl leading-none font-semibold tracking-tight text-ink">
          Gamlib
        </h1>
        <span className="text-[11px] text-ink-faint">v{__APP_VERSION__}</span>
      </div>

      {/* An update takes the whole screen: the startup steps are about to be
          thrown away by the restart, so showing them would be a lie. */}
      {update ? (
        <div className="flex w-72 flex-col gap-3">
          <p className="text-center text-sm text-ink-muted">
            {update.version
              ? `Mise à jour vers ${update.version}…`
              : "Mise à jour…"}
          </p>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-200"
              style={{ width: `${Math.round(update.progress * 100)}%` }}
            />
          </div>
          <p className="text-center text-[11px] text-ink-faint">
            L'application redémarrera toute seule.
          </p>
        </div>
      ) : (
        <ul className="flex w-64 flex-col gap-2.5">
          {steps.map((step) => (
            <li key={step.label} className="flex items-center gap-3 text-sm">
              <span className="flex w-4 justify-center">
                <Marker state={step.state} />
              </span>
              <span
                className={
                  step.state === "pending" ? "text-ink-faint" : "text-ink-muted"
                }
              >
                {step.label}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

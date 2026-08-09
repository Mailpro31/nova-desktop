import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import "./RecordingOverlay.css";
import { commands, events } from "@/bindings";
import type {
  StreamPhase,
  StreamPhaseEvent,
  StreamTextEvent,
} from "@/bindings";
import i18n, { syncLanguageFromSettings } from "@/i18n";
import { getLanguageDirection } from "@/lib/utils/rtl";
import { styleColor } from "@/lib/styleColors";
import { styleLockFeature } from "@/lib/builtinStyles";

type OverlayState =
  | "idle"
  | "recording"
  | "streaming"
  | "transcribing"
  | "processing"
  | "paste-fallback";

type StyleItem = { id: string; name: string };

// Number of reactive bars in the waveform (the simple, smoothed style shared by
// every overlay form). Mic levels arrive as 16 FFT buckets; we take the first N.
const WAVE_BARS = 9;

// ---- Suggestion de Style contextuelle discrète (point 5) ----
// Toute la mémoire/décision vit côté frontend (aucun churn de réglages) et
// PERSISTE dans le localStorage de l'overlay. Seuil volontairement bas mais pas
// immédiat : on ne propose qu'après quelques dictées dans la MÊME app avec un
// Style fixe qui ne colle pas, et jamais deux fois une paire « ne plus afficher ».
const SUGGEST_THRESHOLD = 3;
const SUGGEST_COUNTS_KEY = "nova.styleSuggest.counts";
const SUGGEST_DISMISSED_KEY = "nova.styleSuggest.dismissed";
// Hauteur de fenêtre overlay (px) pour loger la carte de suggestion au repos,
// via le même mécanisme que le menu des Styles (`set_overlay_menu_height`).
const SUGGEST_OVERLAY_HEIGHT = 150;
// Styles génériques qu'il n'y a aucun intérêt à suggérer.
const SUGGEST_SKIP_STYLES = new Set(["auto", "default_improve_transcriptions"]);

function readSuggestStore<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function writeSuggestStore(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // localStorage indisponible : la suggestion reste éphémère, jamais de crash.
  }
}
// Libellé lisible d'un exécutable (« outlook.exe » → « Outlook »).
function friendlyAppLabel(process: string): string {
  const base = (
    process
      .replace(/\.exe$/i, "")
      .split(/[\\/]/)
      .pop() ?? process
  ).trim();
  if (!base) return process;
  return base.charAt(0).toUpperCase() + base.slice(1);
}

const RecordingOverlay: React.FC = () => {
  const { t } = useTranslation();
  const [isVisible, setIsVisible] = useState(false);
  const [state, setState] = useState<OverlayState>("recording");
  const [levels, setLevels] = useState<number[]>(Array(WAVE_BARS).fill(0));
  const [streamText, setStreamText] = useState<StreamTextEvent>({
    committed: "",
    tentative: "",
  });
  const [phase, setPhase] = useState<StreamPhase>("listening");
  const [thinkingProgress, setThinkingProgress] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [fallbackText, setFallbackText] = useState("");
  // Bumped on each new streaming session so the Live card remounts fresh (replays
  // the pop-in, and never animates in from the previous panel's open size).
  const [session, setSession] = useState(0);
  // Overlay placement (top vs bottom of the screen). The Live panel grows downward
  // from a top overlay (oldest line under the pill) and upward from a bottom one.
  const [position, setPosition] = useState<"top" | "bottom">("bottom");
  // True once live text overflows the cap. A top overlay fades its top edge only
  // while overflowing, so the resting first line stays crisp flush under the pill.
  const [overflowing, setOverflowing] = useState(false);
  // État de repos (bulle « toujours affichée ») : liste des Styles + menu.
  const [styles, setStyles] = useState<StyleItem[]>([]);
  const [selectedStyleId, setSelectedStyleId] = useState<string>("");
  const [menuOpen, setMenuOpen] = useState(false);
  // Fonctionnalités du palier courant : décide quels Styles sont verrouillés.
  // Défensif : licence dormante → `has()` vrai partout → aucune fonctionnalité
  // absente → rien n'est verrouillé (bulle inchangée pour tous aujourd'hui).
  const [features, setFeatures] = useState<Record<string, boolean>>({});

  // Un Style est verrouillé si sa fonctionnalité de palier n'est pas accessible.
  // `?? true` = fonctionnalité inconnue → jamais de verrou par défaut.
  const styleLock = (id: string): { locked: boolean; tier: string } => {
    const feature = styleLockFeature(id);
    if (!feature) return { locked: false, tier: "" };
    const locked = !(features[feature] ?? true);
    const tier = feature === "custom_styles" ? "NOVA ULTRA" : "NOVA PRO";
    return { locked, tier };
  };

  const fetchStyles = async () => {
    try {
      invoke<{ features: Record<string, boolean> }>("get_license_status")
        .then((st) => setFeatures(st.features ?? {}))
        .catch(() => setFeatures({}));
      const s = await commands.getAppSettings();
      if (s.status === "ok") {
        // Le mode « Automatique » ouvre la liste : c'est le défaut (Nova choisit
        // le Style selon l'app active). Il ne vit pas dans `post_process_prompts`,
        // on l'ajoute donc en tête pour qu'il apparaisse dans la bulle et le menu.
        const autoItem: StyleItem = {
          id: "auto",
          name: t("settings.postProcessing.autoStyle.option"),
        };
        setStyles([
          autoItem,
          ...(s.data.post_process_prompts ?? []).map((p) => ({
            id: p.id,
            name: p.name,
          })),
        ]);
        setSelectedStyleId(s.data.post_process_selected_prompt_id ?? "auto");
      }
    } catch {
      // Bulle purement décorative si les réglages ne se lisent pas.
    }
  };

  // Hauteur d'une rangée de menu (px), doit rester en phase avec la CSS .smenu-item.
  const MENU_ROW_H = 34;

  const resizeForMenu = async (open: boolean, count: number) => {
    const height = open ? 46 + count * MENU_ROW_H + 14 : 0;
    try {
      await invoke("set_overlay_menu_height", { height });
    } catch {
      // La fenêtre garde sa taille si le redimensionnement échoue.
    }
  };

  const toggleMenu = async () => {
    const next = !menuOpen;
    if (next) await fetchStyles();
    await resizeForMenu(next, styles.length || 1);
    setMenuOpen(next);
  };

  const chooseStyle = async (id: string) => {
    // Un Style verrouillé (au-delà du palier) n'est pas sélectionnable : on
    // laisse le menu ouvert plutôt que d'appliquer un Style interdit.
    if (styleLock(id).locked) return;
    setSelectedStyleId(id);
    setMenuOpen(false);
    await resizeForMenu(false, 0);
    try {
      const result = await commands.setPostProcessSelectedPrompt(id);
      // tauri-specta résout parfois une erreur Rust en { status: "error" }
      // plutôt que de rejeter la promesse — sans ce contrôle, un échec
      // d'écriture backend laisserait la bulle afficher un Style qui n'a en
      // réalité jamais été sauvegardé, jusqu'au prochain fetchStyles().
      if (result.status === "error") {
        await fetchStyles();
      }
    } catch {
      // La sélection locale a pu diverger du backend : on se resynchronise
      // plutôt que de laisser un état stale dans la bulle.
      await fetchStyles();
    }
  };

  // ---- Retour micro discret pendant l'écoute (point 3) ----
  // Dérivé UNIQUEMENT des niveaux déjà reçus (`mic-level`) : aucune analyse
  // audio supplémentaire côté backend. On confirme un état sur une courte
  // fenêtre glissante pour ne JAMAIS clignoter ni harceler : « Je vous entends »
  // quand le niveau est franc, « Parlez un peu plus fort » seulement après un
  // silence continu d'environ deux secondes. N'apparaît que dans la pilule
  // compacte d'enregistrement (l'overlay Live montre déjà le texte en direct).
  const [micHint, setMicHint] = useState<null | "ok" | "low">(null);
  const micWindowRef = useRef<{ lowSince: number; okSince: number }>({
    lowSince: 0,
    okSince: 0,
  });
  const listeningCompact = isVisible && state === "recording";

  useEffect(() => {
    if (!listeningCompact) {
      micWindowRef.current = { lowSince: 0, okSince: 0 };
      setMicHint(null);
      return;
    }
    const energy = levels.length ? Math.max(...levels) : 0;
    const now =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    const w = micWindowRef.current;
    const LOW = 0.1; // sous ce niveau : trop faible
    const OK = 0.3; // au-dessus : clairement entendu
    const LOW_HOLD_MS = 2000; // silence continu avant d'inviter à parler plus fort
    const OK_HOLD_MS = 300; // brève confirmation avant « Je vous entends »
    if (energy >= OK) {
      w.lowSince = 0;
      if (!w.okSince) w.okSince = now;
      if (now - w.okSince >= OK_HOLD_MS) setMicHint("ok");
    } else if (energy <= LOW) {
      w.okSince = 0;
      if (!w.lowSince) w.lowSince = now;
      if (now - w.lowSince >= LOW_HOLD_MS) setMicHint("low");
    } else {
      // Zone intermédiaire (l'utilisateur parle doucement) : on ne réarme pas le
      // compteur de silence et on laisse l'indice courant tel quel, sans à-coup.
      w.lowSince = 0;
    }
  }, [levels, listeningCompact]);

  // ---- Suggestion de Style contextuelle (point 5) ----
  // Paire (app, Style qui collerait) en attente d'affichage. La validation de
  // palier et l'existence du Style sont re-vérifiées à l'affichage (features à
  // jour). Persistance (comptes + « ne plus afficher ») dans le localStorage.
  const [suggestion, setSuggestion] = useState<{
    process: string;
    styleId: string;
  } | null>(null);

  const applySuggestion = async () => {
    if (!suggestion) return;
    const { process, styleId } = suggestion;
    // Adopté → on ne re-propose plus cette paire.
    const key = `${process}::${styleId}`;
    const dismissed = readSuggestStore<string[]>(SUGGEST_DISMISSED_KEY, []);
    if (!dismissed.includes(key)) {
      dismissed.push(key);
      writeSuggestStore(SUGGEST_DISMISSED_KEY, dismissed);
    }
    setSuggestion(null);
    await chooseStyle(styleId);
  };

  const dismissSuggestion = () => {
    if (!suggestion) return;
    const key = `${suggestion.process}::${suggestion.styleId}`;
    const dismissed = readSuggestStore<string[]>(SUGGEST_DISMISSED_KEY, []);
    if (!dismissed.includes(key)) {
      dismissed.push(key);
      writeSuggestStore(SUGGEST_DISMISSED_KEY, dismissed);
    }
    setSuggestion(null);
  };

  // La carte de suggestion est-elle réellement affichable MAINTENANT ? (Style
  // existant dans la liste ET non verrouillé par le palier courant.)
  const suggestionStyle = suggestion
    ? styles.find((s) => s.id === suggestion.styleId)
    : undefined;
  const suggestionVisible =
    !!suggestion && !!suggestionStyle && !styleLock(suggestion.styleId).locked;

  // Au repos (menu fermé), agrandit la fenêtre overlay pour loger la carte —
  // même canal que le menu des Styles. Réinitialise à la hauteur de repos sinon.
  useEffect(() => {
    if (state !== "idle" || menuOpen) return;
    invoke("set_overlay_menu_height", {
      height: suggestionVisible ? SUGGEST_OVERLAY_HEIGHT : 0,
    }).catch(() => {});
  }, [suggestionVisible, state, menuOpen]);

  const smoothedLevelsRef = useRef<number[]>(Array(16).fill(0));
  // Live-text scroll-back: the text region "sticks" to the newest line while the
  // user is at the bottom; if they scroll up to read history, auto-follow pauses
  // until they scroll back down.
  const capRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(true);
  const direction = getLanguageDirection(i18n.language);

  useEffect(() => {
    const setupEventListeners = async () => {
      const unlistenShow = await listen("show-overlay", async (event) => {
        await syncLanguageFromSettings();
        // The Live panel flows downward from a top overlay and upward from a
        // bottom one; read the placement so the layout can flip to match.
        try {
          const settings = await commands.getAppSettings();
          if (settings.status === "ok") {
            setPosition(
              settings.data.overlay_position === "top" ? "top" : "bottom",
            );
          }
        } catch {
          // Keep the previous/default placement if settings can't be read.
        }
        const overlayState = event.payload as OverlayState;
        setState(overlayState);
        if (overlayState === "idle") {
          void fetchStyles();
        } else {
          setMenuOpen(false);
        }
        if (overlayState === "recording" || overlayState === "streaming") {
          setStreamText({ committed: "", tentative: "" });
          setThinkingProgress(0);
        }
        if (overlayState === "transcribing") {
          setThinkingProgress(4);
        }
        if (overlayState === "streaming") {
          setPhase("listening");
          setElapsed(0);
          setSession((s) => s + 1); // remount the card fresh for this session
        }
        setIsVisible(true);
      });

      const unlistenHide = await listen("hide-overlay", () => {
        setIsVisible(false);
      });

      // Changement de placement (haut/bas) pendant que la bulle est déjà visible :
      // la fenêtre native est déplacée côté Rust, mais la carte doit aussi ré-ancrer
      // au bon bord. `show-overlay` ne repasse pas dans ce cas, d'où cet événement.
      const unlistenPosition = await listen<string>(
        "overlay-position",
        (event) => {
          setPosition(event.payload === "top" ? "top" : "bottom");
        },
      );

      const unlistenLevel = await listen<number[]>("mic-level", (event) => {
        const newLevels = event.payload as number[];
        // Lift quiet speech aggressively, with a quick attack and slower release.
        // This only changes the visual meter; the recorded samples stay untouched.
        const smoothed = smoothedLevelsRef.current.map((prev, i) => {
          const raw = Math.max(0, newLevels[i] || 0);
          const target = Math.min(1, Math.pow(raw, 0.45) * 1.65);
          const alpha = target > prev ? 0.72 : 0.24;
          return prev + (target - prev) * alpha;
        });
        smoothedLevelsRef.current = smoothed;
        setLevels(smoothed.slice(0, WAVE_BARS));
      });

      const unlistenStream = await events.streamTextEvent.listen((event) => {
        setStreamText(event.payload);
      });

      const unlistenPhase = await events.streamPhaseEvent.listen((event) => {
        const payload: StreamPhaseEvent = event.payload;
        setPhase(payload.phase);
        if (payload.phase === "working") setThinkingProgress(4);
      });

      const unlistenThinkingComplete = await listen<number>(
        "thinking-complete",
        (event) => {
          setThinkingProgress(100);
          // Acknowledge after React committed and the browser had one chance to
          // paint the completed progress bar. The backend can then paste without
          // an unconditional delay on every transcription.
          requestAnimationFrame(() => {
            invoke("acknowledge_thinking_frame", { id: event.payload }).catch(
              () => {},
            );
          });
        },
      );

      const unlistenPasteFallback = await listen<string>(
        "paste-fallback",
        (event) => {
          setFallbackText(event.payload);
          setState("paste-fallback");
          setIsVisible(true);
        },
      );

      // Contexte de dictée pour la suggestion de Style (point 5). Le backend
      // n'émet que quand un Style FIXE est sélectionné et qu'un autre collerait
      // mieux ; ici on compte par (app, Style) et on ne propose qu'au-delà du
      // seuil, jamais une paire déjà écartée. Comptes/écartés persistés localement.
      const unlistenContext = await listen<{
        process: string;
        resolved: string;
        selected: string;
      }>("dictation-context", (event) => {
        const { process, resolved, selected } = event.payload;
        if (!process || !resolved) return;
        if (resolved === selected) return;
        if (SUGGEST_SKIP_STYLES.has(resolved)) return;
        const key = `${process}::${resolved}`;
        const dismissed = readSuggestStore<string[]>(SUGGEST_DISMISSED_KEY, []);
        if (dismissed.includes(key)) return;
        const counts = readSuggestStore<Record<string, number>>(
          SUGGEST_COUNTS_KEY,
          {},
        );
        const n = (counts[key] ?? 0) + 1;
        counts[key] = n;
        writeSuggestStore(SUGGEST_COUNTS_KEY, counts);
        if (n >= SUGGEST_THRESHOLD) {
          setSuggestion({ process, styleId: resolved });
        }
      });

      return () => {
        unlistenShow();
        unlistenHide();
        unlistenPosition();
        unlistenLevel();
        unlistenStream();
        unlistenPhase();
        unlistenThinkingComplete();
        unlistenPasteFallback();
        unlistenContext();
      };
    };

    setupEventListeners();
  }, []);

  // Elapsed timer while the Live overlay is visible.
  useEffect(() => {
    if (state !== "streaming" || !isVisible) return;
    const id = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(id);
  }, [state, isVisible]);

  // Progression volontairement asymptotique : elle avance vite pendant le
  // traitement sans annoncer une fin prématurée, puis le backend envoie 100 %
  // juste avant de coller le texte.
  useEffect(() => {
    const working =
      state === "transcribing" ||
      state === "processing" ||
      (state === "streaming" && phase === "working");
    if (!working || !isVisible || thinkingProgress >= 100) return;
    const id = setInterval(() => {
      setThinkingProgress((current) =>
        Math.min(92, current + Math.max(0.35, (92 - current) * 0.045)),
      );
    }, 80);
    return () => clearInterval(id);
  }, [state, phase, isVisible, thinkingProgress]);

  // Stick to the bottom as text streams in — but only while pinned, so a user who
  // has scrolled up to read history isn't yanked back down by the next chunk.
  useLayoutEffect(() => {
    const el = capRef.current;
    if (!el) return;
    // Fade the top edge only once text actually overflows the cap.
    setOverflowing(el.scrollHeight > el.clientHeight + 1);
    if (pinnedRef.current) el.scrollTop = el.scrollHeight;
  }, [streamText]);

  // Each fresh streaming session starts pinned to the bottom, fade cleared.
  useEffect(() => {
    pinnedRef.current = true;
    setOverflowing(false);
  }, [session]);

  // Re-pin when the user is within ~a line of the bottom; unpin otherwise.
  const handleStreamScroll = () => {
    const el = capRef.current;
    if (!el) return;
    pinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight <= 16;
  };

  const fmtTime = (s: number) =>
    `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  // ---- Shared building blocks (one visual language for every overlay form) ----
  const waveform = (
    <div className="swave">
      {levels.map((v, i) => (
        <i
          key={i}
          style={{
            height: `${Math.max(3, Math.min(18, 3 + Math.pow(v, 0.7) * 15))}px`,
          }}
        />
      ))}
    </div>
  );

  const cancelBtn = (
    <button
      className="sx"
      aria-label={t("tray.cancel")}
      onClick={() => commands.cancelOperation()}
    >
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path
          d="M4 4 L12 12 M12 4 L4 12"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
    </button>
  );

  const finishBtn = (
    <button
      className="sx sfinish"
      aria-label={t("onboarding.step.finish")}
      onClick={() => commands.finishRecording()}
    >
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path
          d="M3.2 8.2 6.5 11.4 12.9 4.8"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );

  // dot (left) | waveform (center) | timer + cancel (right) — same structure for
  // pill & panel, so the Live morph is a pure width change.
  const listeningRow = (showTimer: boolean) => (
    <div className="sbase">
      <div className="sbase-l">{cancelBtn}</div>
      {waveform}
      <div className="sbase-r">
        {showTimer && <span className="stimer">{fmtTime(elapsed)}</span>}
        {finishBtn}
      </div>
    </div>
  );

  // spinner (left) | label (center) | cancel (right) — same 3-zone grid as the
  // listening row, so the label is centered.
  const workingRow = (label: string, showCancel: boolean) => (
    <div className="sbase sworking-base">
      <div className="sbase-l">
        <span className="sspinner" />
      </div>
      <span className="swork-label">{label}</span>
      <div className="sbase-r">{showCancel && cancelBtn}</div>
      <div className="sthinking-track" aria-hidden="true">
        <i style={{ width: `${thinkingProgress}%` }} />
      </div>
    </div>
  );

  // ---- Idle overlay: la bulle au repos, toujours affichée.
  // [engrenage → réglages] [orbe Nova] [étoile → menu des Styles] ----
  if (state === "idle") {
    return (
      <div
        dir={direction}
        className={`ov-stage ${position} ov-fade ${isVisible ? "show" : ""}`}
      >
        <div className="sidle-col">
          {menuOpen && (
            <div className={`smenu ${position}`}>
              {styles.map((s) => {
                const { locked, tier } = styleLock(s.id);
                return (
                  <button
                    key={s.id}
                    className={`smenu-item ${s.id === selectedStyleId ? "active" : ""} ${
                      locked ? "locked" : ""
                    }`}
                    onClick={() => chooseStyle(s.id)}
                    disabled={locked}
                    aria-disabled={locked}
                  >
                    <span
                      className="smenu-dot"
                      style={{ background: styleColor(s.id) }}
                    />
                    <span className="smenu-name">{s.name}</span>
                    {locked ? (
                      <span
                        className={`smenu-lock ${tier.includes("ULTRA") ? "ultra" : ""}`}
                      >
                        {t("license.requiresTier", { tier })}
                      </span>
                    ) : (
                      s.id === selectedStyleId && (
                        <svg
                          className="smenu-check"
                          viewBox="0 0 24 24"
                          aria-hidden="true"
                        >
                          <path
                            d="M20 6 9 17l-5-5"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.4"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )
                    )}
                  </button>
                );
              })}
            </div>
          )}
          {!menuOpen && suggestionVisible && suggestion && suggestionStyle && (
            <div className={`ssuggest ${position}`}>
              <p className="ssuggest-text">
                {t("overlay.styleSuggestion", {
                  app: friendlyAppLabel(suggestion.process),
                  style: suggestionStyle.name,
                })}
              </p>
              <div className="ssuggest-actions">
                <button
                  type="button"
                  className="ssuggest-dismiss"
                  onClick={dismissSuggestion}
                >
                  {t("overlay.styleSuggestionDismiss")}
                </button>
                <button
                  type="button"
                  className="ssuggest-apply"
                  onClick={applySuggestion}
                >
                  {t("overlay.styleSuggestionApply")}
                </button>
              </div>
            </div>
          )}
          <div className="scard sidle">
            <button
              className="sgear"
              aria-label={t("overlay.openSettings")}
              onClick={() => {
                commands.showMainWindowCommand().catch(() => {});
              }}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                />
                <path
                  d="M19.4 13a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1v.2a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 9 17.3a1.6 1.6 0 0 0-1.8.3l-.1-.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.7 9a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H23a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            <span className="sdot" />
            <button
              className={`sgear sstar ${menuOpen ? "open" : ""}`}
              aria-label={t("overlay.chooseStyle")}
              onClick={toggleMenu}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M12 3.6l2.5 5.2 5.7.7-4.2 3.9 1.1 5.6-5.1-2.8-5.1 2.8 1.1-5.6L3.8 9.5l5.7-.7L12 3.6Z"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ---- Live overlay: a pill that sculpts open into a panel ----
  if (state === "streaming") {
    const hasText =
      streamText.committed.length > 0 || streamText.tentative.length > 0;
    const working = phase === "working";
    // Keep the panel open whenever there's text — even while finalizing — so the
    // transcript stays put under a working spinner instead of collapsing and
    // squishing the text mid-stream. Only fall back to the small working pill
    // when there was no text to preserve.
    const open = hasText;
    const collapsed = working && !hasText;

    return (
      <div dir={direction} className={`ov-stage ${position}`}>
        <div
          key={session}
          className={`scard ${open ? "open" : ""} ${collapsed ? "working" : ""} ${
            isVisible ? "" : "leaving"
          }`}
        >
          <div className="stext">
            <div className="stext-clip">
              <div
                className={`stext-cap ${overflowing ? "overflowing" : ""}`}
                ref={capRef}
                onScroll={handleStreamScroll}
              >
                <p>
                  <span className="committed">
                    {streamText.committed ? streamText.committed + " " : ""}
                  </span>
                  <span className="tentative">{streamText.tentative}</span>
                  {/* Drop the blinking caret once finalizing — it's no longer
                      capturing, and a static spinner conveys the work. */}
                  {!working && <span className="scaret" />}
                </p>
              </div>
            </div>
          </div>
          {working
            ? workingRow(t("overlay.processing"), true)
            : listeningRow(open)}
        </div>
      </div>
    );
  }

  // ---- Minimal overlay: exactly one row at a time — waveform (recording), or a
  // spinner + label (transcribing / processing). Never both. The pill animates its
  // width between them; the cancel button is in both rows so it stays put.
  const working = state === "transcribing" || state === "processing";
  const workLabel = t("overlay.processing");

  if (state === "paste-fallback") {
    return (
      <div
        dir={direction}
        className={`ov-stage ${position} ov-fade ${isVisible ? "show" : ""}`}
      >
        <div className="scard sfallback">
          <div className="sfallback-head">
            <span className="sfallback-info" aria-hidden="true" />
            <strong>{t("tray.copyLastTranscript")}</strong>
            <button
              className="sfallback-close"
              aria-label={t("common.close")}
              onClick={() => commands.dismissRecordingOverlay()}
            >
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path
                  d="M4 4 L12 12 M12 4 L4 12"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
          <p className="sfallback-text">{fallbackText}</p>
          <button
            className="sfallback-copy"
            onClick={async () => {
              await commands.copyTranscription(fallbackText);
              await commands.dismissRecordingOverlay();
            }}
          >
            {t("common.copy")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      dir={direction}
      className={`ov-stage ${position} ov-fade ${isVisible ? "show" : ""}`}
    >
      <div className="slisten-wrap">
        <div
          className={`scard compact ${working && isVisible ? "cworking" : ""}`}
        >
          {working ? workingRow(workLabel, true) : listeningRow(false)}
        </div>
        {/* Indice micro discret : jamais dans la même rangée que la forme d'onde
            (au-dessus/en dessous de la pilule), ne la recouvre donc jamais. */}
        <div
          className={`smic-hint ${micHint ?? ""} ${micHint ? "show" : ""}`}
          aria-live="polite"
        >
          {micHint === "low"
            ? t("overlay.micTooLow")
            : micHint === "ok"
              ? t("overlay.micHearing")
              : ""}
        </div>
      </div>
    </div>
  );
};

export default RecordingOverlay;

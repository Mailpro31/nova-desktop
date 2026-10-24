import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  Copy,
  Ellipsis,
  Replace,
  Square,
  Volume2,
  X,
} from "lucide-react";

import { commands, type TargetWindow } from "@/bindings";
import { NOVA_ACTION_DEFS, translationTarget } from "@/lib/bubble/actions";
import {
  CONNECTIONS,
  GROUP_ORDER,
  connectionById,
  fits,
  launchFor,
  type Connection,
} from "@/lib/bubble/connections";
import { countHabit, loadBubblePreferences } from "@/lib/bubble/preferences";
import {
  NOVA_ACTIONS,
  suggest,
  traits,
  type NovaActionId,
} from "@/lib/bubble/suggest";
import {
  clientCommandMessage,
  commandMessage,
  isCommandRefusal,
  refusalMessage,
  type CommandMessage,
} from "@/lib/commands/errors";
import { OrganizationApi } from "@/lib/organizationApi";
import { loadReadingComfort } from "@/lib/readingComfort";
import { speak, stopSpeaking } from "@/lib/speech";

interface Selection {
  text: string;
  editable: boolean;
  target: TargetWindow;
}

type View =
  | { name: "pill" }
  | { name: "more" }
  | { name: "running"; action: NovaActionId }
  | { name: "result"; action: NovaActionId; result: string }
  | { name: "error"; action: NovaActionId; message: CommandMessage }
  | { name: "pasted"; app: string };

/** Les vues qui restent à l'écran quand l'élève clique ailleurs. */
const PINNED: View["name"][] = ["running", "result", "error"];

/**
 * La bulle de sélection.
 *
 * Une pastille de trois actions choisies pour le texte (`suggest`), plus Lire
 * et « Plus ». Un clic sur une action de Nova affiche la réponse dans la bulle,
 * un clic sur une application l'ouvre avec le texte. La fenêtre prend la
 * taille de son contenu (`selectionBubbleLayout`) et ne prend jamais le focus.
 */
export const SelectionBubble: React.FC = () => {
  const { t, i18n } = useTranslation();
  const [selection, setSelection] = useState<Selection | null>(null);
  const [view, setView] = useState<View>({ name: "pill" });
  const [speaking, setSpeaking] = useState(false);
  const [copied, setCopied] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  // Une réponse arrivée après une nouvelle sélection ne doit pas s'afficher.
  const request = useRef(0);

  useEffect(() => {
    const show = listen<Selection>("selection-bubble-show", (event) => {
      request.current += 1;
      stopSpeaking();
      setSpeaking(false);
      setCopied(false);
      setSelection(event.payload);
      setView({ name: "pill" });
    });
    const hide = listen("selection-bubble-hide", () => {
      request.current += 1;
      stopSpeaking();
      setSpeaking(false);
      setSelection(null);
    });
    return () => {
      void show.then((off) => off());
      void hide.then((off) => off());
    };
  }, []);

  // La fenêtre suit la taille de son contenu : à chaque nouvelle sélection ou
  // vue (le point d'ancrage change), puis à chaque changement de taille (une
  // police chargée après coup, une réponse plus longue).
  useLayoutEffect(() => {
    const element = box.current;
    if (!selection || !element) return;
    const pinned = PINNED.includes(view.name);
    const layout = () => {
      const rect = element.getBoundingClientRect();
      void commands.selectionBubbleLayout(
        Math.ceil(rect.width),
        Math.ceil(rect.height),
        pinned,
      );
    };
    layout();
    const observer = new ResizeObserver(layout);
    observer.observe(element);
    return () => observer.disconnect();
  }, [selection, view, speaking, copied]);

  useEffect(() => {
    if (view.name !== "pasted") return;
    const timer = window.setTimeout(
      () => void commands.selectionBubbleHide(),
      2600,
    );
    return () => window.clearTimeout(timer);
  }, [view]);

  if (!selection) return null;
  const { text } = selection;
  const ui = i18n.language;

  const runNova = async (action: NovaActionId) => {
    countHabit(action);
    const id = ++request.current;
    setView({ name: "running", action });
    try {
      // Le serveur et le jeton de l'école sont joints côté Rust.
      const response = await new OrganizationApi("").executeCommand(
        NOVA_ACTION_DEFS[action].instruction(ui, text),
        text,
      );
      if (id !== request.current) return;
      const result = response.text?.trim() ?? "";
      setView(
        result
          ? { name: "result", action, result }
          : {
              name: "error",
              action,
              message: clientCommandMessage("emptyResult"),
            },
      );
    } catch (error) {
      if (id !== request.current) return;
      setView({
        name: "error",
        action,
        message: clientCommandMessage(
          isCommandRefusal(error) ? refusalMessage(error) : "failed",
        ),
      });
    }
  };

  const openApp = async (
    connection: Connection,
    action: NovaActionId = "explain",
  ) => {
    countHabit(`open:${connection.id}`);
    const launch = launchFor(
      connection,
      text,
      t(`bubble.ask.${action}`),
      translationTarget(ui, text),
    );
    if (launch.clipboard) {
      await writeText(launch.clipboard);
      setView({ name: "pasted", app: connection.name });
    } else {
      void commands.selectionBubbleHide();
    }
    await openUrl(launch.url);
  };

  const run = (id: string) => {
    if (id.startsWith("open:")) {
      const connection = connectionById(id.slice(5));
      if (connection) void openApp(connection);
    } else {
      void runNova(id as NovaActionId);
    }
  };

  const toggleSpeech = (content: string) => {
    if (speaking) {
      stopSpeaking();
      setSpeaking(false);
      return;
    }
    const started = speak(content, {
      uiLanguage: ui,
      rate: loadReadingComfort().speechRate,
      onEnd: () => setSpeaking(false),
    });
    setSpeaking(started);
  };

  const preferences = loadBubblePreferences();
  const preferredAi =
    connectionById(preferences.ai) ?? connectionById("chatgpt")!;

  return (
    // La marge laisse la place à l'ombre ; elle fait partie de la fenêtre mesurée.
    <div ref={box} className="w-max p-2">
      <div>
        {view.name === "pill" && (
          <Pill>
            {suggest(
              text,
              traits(text, selection.editable),
              preferences.habits,
            ).map((id) => (
              <React.Fragment key={id}>{actionButton(id)}</React.Fragment>
            ))}
            <Divider />
            <IconButton
              label={speaking ? t("bubble.stop") : t("bubble.read")}
              onClick={() => toggleSpeech(text)}
            >
              {speaking ? <Square size={15} /> : <Volume2 size={16} />}
            </IconButton>
            <IconButton
              label={t("bubble.more")}
              onClick={() => setView({ name: "more" })}
            >
              <Ellipsis size={17} />
            </IconButton>
          </Pill>
        )}

        {view.name === "more" && (
          <Card>
            <header className="flex items-center gap-2 border-b border-hairline px-2 py-1.5">
              <IconButton
                label={t("bubble.back")}
                onClick={() => setView({ name: "pill" })}
              >
                <ArrowLeft size={16} />
              </IconButton>
              <p className="min-w-0 flex-1 truncate text-xs text-text-secondary">
                {text}
              </p>
            </header>
            <div className="max-h-[360px] overflow-y-auto px-3 pb-3">
              <GroupTitle>{t("bubble.withNova")}</GroupTitle>
              <div className="grid grid-cols-4 gap-1">
                {NOVA_ACTIONS.map((action) => {
                  const { icon: Icon, labelKey } = NOVA_ACTION_DEFS[action];
                  return (
                    <button
                      key={action}
                      type="button"
                      onClick={() => void runNova(action)}
                      className="flex flex-col items-center gap-1 rounded-chip px-1 py-2 text-[12px] leading-tight text-text transition-colors duration-[120ms] hover:bg-accent/10 cursor-pointer"
                    >
                      <Icon
                        size={18}
                        strokeWidth={1.75}
                        className="text-accent"
                      />
                      <span className="text-center">{t(labelKey)}</span>
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => toggleSpeech(text)}
                  className="flex flex-col items-center gap-1 rounded-chip px-1 py-2 text-[12px] leading-tight text-text transition-colors duration-[120ms] hover:bg-accent/10 cursor-pointer"
                >
                  {speaking ? (
                    <Square size={18} className="text-accent" />
                  ) : (
                    <Volume2
                      size={18}
                      strokeWidth={1.75}
                      className="text-accent"
                    />
                  )}
                  <span>{speaking ? t("bubble.stop") : t("bubble.read")}</span>
                </button>
              </div>
              {GROUP_ORDER.map((group) => {
                const apps = CONNECTIONS.filter(
                  (c) => c.group === group && fits(c, text),
                ).sort(
                  (a, b) =>
                    Number(b.id === preferredAi.id) -
                    Number(a.id === preferredAi.id),
                );
                if (apps.length === 0) return null;
                return (
                  <section key={group}>
                    <GroupTitle>{t(`bubble.group.${group}`)}</GroupTitle>
                    <div className="flex flex-wrap gap-1.5">
                      {apps.map((connection) => (
                        <button
                          key={connection.id}
                          type="button"
                          onClick={() => void openApp(connection)}
                          className="flex items-center gap-1.5 rounded-full border border-hairline py-1 pe-2.5 ps-1.5 text-[12px] text-text transition-colors duration-[120ms] hover:border-accent/40 hover:bg-accent/5 cursor-pointer"
                        >
                          <AppLogo connection={connection} size={16} />
                          {connection.name}
                        </button>
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          </Card>
        )}

        {view.name === "running" && (
          <Card>
            {cardHeader(view.action)}
            <div
              className="space-y-2 px-4 py-4"
              role="status"
              aria-label={t("bubble.running")}
            >
              <p className="text-xs text-text-secondary">
                {t("bubble.running")}
              </p>
              {[92, 78, 60].map((width) => (
                <div
                  key={width}
                  style={{ width: `${width}%` }}
                  className="h-2.5 rounded-full bg-mid-gray/15 motion-safe:animate-pulse"
                />
              ))}
            </div>
          </Card>
        )}

        {view.name === "result" && (
          <Card wide>
            {cardHeader(view.action)}
            <div className="max-h-[300px] overflow-y-auto px-4 py-3">
              <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-text">
                {view.result}
              </p>
              <p className="mt-3 text-xs text-text-secondary">
                {t("novaCommands.generatedNote")}
              </p>
            </div>
            <footer className="flex items-center gap-1 border-t border-hairline px-2 py-1.5">
              <FooterButton onClick={() => toggleSpeech(view.result)}>
                {speaking ? <Square size={14} /> : <Volume2 size={15} />}
                {speaking ? t("bubble.stop") : t("bubble.read")}
              </FooterButton>
              <FooterButton
                onClick={() => {
                  void writeText(view.result).then(() => setCopied(true));
                }}
              >
                {copied ? <Check size={15} /> : <Copy size={15} />}
                {copied ? t("bubble.copied") : t("bubble.copy")}
              </FooterButton>
              {selection.editable && NOVA_ACTION_DEFS[view.action].rewrites && (
                <FooterButton
                  onClick={() => {
                    void commands
                      .selectionBubbleReplace(view.result, selection.target)
                      .then((outcome) => {
                        if (outcome.status === "error") {
                          setView({
                            name: "error",
                            action: view.action,
                            message: commandMessage(outcome.error),
                          });
                        }
                      });
                  }}
                >
                  <Replace size={15} />
                  {t("bubble.replace")}
                </FooterButton>
              )}
              <span className="flex-1" />
              <FooterButton
                label={t("bubble.continueIn", { app: preferredAi.name })}
                onClick={() => void openApp(preferredAi, view.action)}
              >
                <AppLogo connection={preferredAi} size={15} />
                {preferredAi.name}
                <ArrowUpRight size={13} className="text-text-secondary" />
              </FooterButton>
            </footer>
          </Card>
        )}

        {view.name === "error" && (
          <Card>
            {cardHeader(view.action)}
            <div className="px-4 py-3">
              <p className="text-sm font-medium text-text">
                {t(view.message.titleKey)}
              </p>
              <p className="mt-1 text-sm leading-relaxed text-text-secondary">
                {t(view.message.bodyKey)}
              </p>
              <button
                type="button"
                onClick={() => void openApp(preferredAi, view.action)}
                className="mt-3 flex items-center gap-2 rounded-control bg-accent px-3 py-1.5 text-sm font-medium text-white transition-colors duration-[120ms] hover:bg-accent-hover cursor-pointer"
              >
                <AppLogo connection={preferredAi} size={16} />
                {t("bubble.askIn", { app: preferredAi.name })}
                <ArrowUpRight size={14} />
              </button>
            </div>
          </Card>
        )}

        {view.name === "pasted" && (
          <Pill>
            <span className="flex items-center gap-2 px-2 py-1 text-[13px] text-text">
              <Check size={15} className="text-accent" />
              {t("bubble.pasted", { app: view.app })}
            </span>
          </Pill>
        )}
      </div>
    </div>
  );

  function actionButton(id: string) {
    const connection = id.startsWith("open:")
      ? connectionById(id.slice(5))
      : undefined;
    const action = connection
      ? undefined
      : NOVA_ACTION_DEFS[id as NovaActionId];
    if (!connection && !action) return null;
    const Icon = action?.icon;
    return (
      <button
        type="button"
        onClick={() => run(id)}
        className="flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[13px] font-medium text-text transition-colors duration-[120ms] hover:bg-accent/10 cursor-pointer"
      >
        {connection ? (
          <AppLogo connection={connection} size={16} />
        ) : (
          Icon && <Icon size={16} strokeWidth={1.9} className="text-accent" />
        )}
        {connection ? connection.name : t(action!.labelKey)}
      </button>
    );
  }

  function cardHeader(action: NovaActionId) {
    const { icon: Icon, labelKey } = NOVA_ACTION_DEFS[action];
    return (
      <header className="flex items-center gap-2 border-b border-hairline py-1.5 pe-1.5 ps-3.5">
        <Icon size={16} strokeWidth={1.9} className="text-accent" />
        <h2 className="flex-1 text-sm font-medium text-text">{t(labelKey)}</h2>
        <IconButton
          label={t("bubble.close")}
          onClick={() => void commands.selectionBubbleHide()}
        >
          <X size={16} />
        </IconButton>
      </header>
    );
  }
};

const Pill: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="bubble-in flex items-center gap-0.5 rounded-full border border-hairline bg-surface p-1 shadow-floating">
    {children}
  </div>
);

const Card: React.FC<{ children: React.ReactNode; wide?: boolean }> = ({
  children,
  wide,
}) => (
  <div
    className={`bubble-in flex flex-col overflow-hidden rounded-panel border border-hairline bg-surface shadow-floating ${
      wide ? "w-[400px]" : "w-[360px]"
    }`}
  >
    {children}
  </div>
);

const Divider: React.FC = () => (
  <span aria-hidden="true" className="mx-0.5 h-5 w-px bg-hairline" />
);

const GroupTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h3 className="mb-1.5 mt-3 text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
    {children}
  </h3>
);

const IconButton: React.FC<{
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}> = ({ label, onClick, children }) => (
  <button
    type="button"
    aria-label={label}
    title={label}
    onClick={onClick}
    className="flex h-8 w-8 items-center justify-center rounded-full text-text-secondary transition-colors duration-[120ms] hover:bg-mid-gray/10 hover:text-text cursor-pointer"
  >
    {children}
  </button>
);

const FooterButton: React.FC<{
  onClick: () => void;
  children: React.ReactNode;
  /** Le nom complet, quand le bouton n'en montre qu'une partie. */
  label?: string;
}> = ({ onClick, children, label }) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={label}
    title={label}
    className="flex items-center gap-1.5 whitespace-nowrap rounded-chip px-2 py-1.5 text-[13px] text-text transition-colors duration-[120ms] hover:bg-mid-gray/10 cursor-pointer"
  >
    {children}
  </button>
);

/** Le logo officiel, ou une pastille à l'initiale dans la couleur de la marque. */
const AppLogo: React.FC<{ connection: Connection; size: number }> = ({
  connection,
  size,
}) =>
  connection.logo ? (
    <img
      src={connection.logo}
      alt=""
      width={size}
      height={size}
      className="shrink-0 rounded-[4px] object-contain"
    />
  ) : (
    <span
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        background: connection.color,
        fontSize: size * 0.62,
      }}
      className="flex shrink-0 items-center justify-center rounded-[4px] font-semibold leading-none text-white"
    >
      {connection.name.charAt(0)}
    </span>
  );

export default SelectionBubble;

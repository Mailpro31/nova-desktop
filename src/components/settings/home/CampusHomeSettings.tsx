import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Mic,
  X,
  Sparkles,
  Check,
  Shield,
  ChevronRight,
  FileAudio,
} from "lucide-react";
import { useSettings } from "../../../hooks/useSettings";
import { loadCampusSession } from "@/lib/campusSession";
import { isServerReachable } from "@/lib/campusApi";
import { styleColor } from "@/lib/styleColors";
import { CampusFileTranscribeModal } from "./CampusFileTranscribeModal";
import type { SidebarSection } from "../../Sidebar";
import type { ShortcutBinding, LLMPrompt } from "@/bindings";

interface CampusHomeSettingsProps {
  onNavigate?: (section: SidebarSection) => void;
}

interface StyleItem {
  id: string;
  name: string;
}

interface ActionCardProps {
  icon: React.ElementType;
  label: string;
  shortcut?: string;
  onClick?: () => void;
}

const ActionCard: React.FC<ActionCardProps> = ({
  icon: Icon,
  label,
  shortcut,
  onClick,
}) => {
  const renderShortcut = () => {
    if (!shortcut) return null;
    const parts = shortcut.split(/\s+/);
    return (
      <span className="inline-flex items-center gap-1">
        {parts.map((part, i) => (
          <kbd
            key={i}
            className="inline-flex items-center justify-center px-1.5 py-0.5 min-w-[1.5rem] h-5 text-[11px] font-medium rounded bg-white border border-hairline shadow-sm text-text-secondary"
          >
            {part}
          </kbd>
        ))}
      </span>
    );
  };

  const Content = (
    <>
      <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-mid-gray/10 text-text group-hover:bg-accent/10 group-hover:text-accent transition-colors">
        <Icon size={20} strokeWidth={1.75} />
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-text">{label}</p>
        {shortcut && <div className="mt-0.5">{renderShortcut()}</div>}
      </div>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="group flex items-center gap-3 p-3 rounded-2xl bg-white border border-hairline shadow-sm hover:border-accent/40 hover:shadow-md transition-all text-left w-full"
      >
        {Content}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-3 p-3 rounded-2xl bg-white border border-hairline shadow-sm">
      {Content}
    </div>
  );
};

const StyleMiniCard: React.FC<{ style: StyleItem; active: boolean }> = ({
  style,
  active,
}) => (
  <div
    className={`flex items-center gap-2.5 p-2.5 rounded-xl border transition-colors ${
      active
        ? "bg-white border-accent/40 shadow-sm"
        : "bg-white border-hairline"
    }`}
  >
    <span
      className="w-2.5 h-2.5 rounded-full shrink-0"
      style={{ background: styleColor(style.id) }}
    />
    <span className="text-sm font-medium truncate flex-1">{style.name}</span>
    {active && <Check size={14} className="text-accent shrink-0" />}
  </div>
);

export const CampusHomeSettings: React.FC<CampusHomeSettingsProps> = ({
  onNavigate,
}) => {
  const { t } = useTranslation();
  const { getSetting } = useSettings();
  const [serverUrl, setServerUrl] = useState<string | null>(null);
  const [reachable, setReachable] = useState<boolean>(false);

  const bindings = getSetting("bindings") ?? {};
  const transcribeBinding = (bindings as Record<string, ShortcutBinding>)[
    "transcribe"
  ]?.current_binding;
  const cancelBinding = (bindings as Record<string, ShortcutBinding>)[
    "cancel"
  ]?.current_binding;
  const postProcessBinding = (bindings as Record<string, ShortcutBinding>)[
    "transcribe_with_post_process"
  ]?.current_binding;

  const [isFileModalOpen, setIsFileModalOpen] = useState(false);

  const prompts = (getSetting("post_process_prompts") ?? []) as LLMPrompt[];
  const selectedPromptId =
    getSetting("post_process_selected_prompt_id") ?? "auto";

  const visibleStyles: StyleItem[] = [
    { id: "auto", name: t("settings.postProcessing.autoStyle.option") },
    ...prompts.slice(0, 5).map((p) => ({ id: p.id, name: p.name })),
  ];

  useEffect(() => {
    let alive = true;
    loadCampusSession().then((session) => {
      if (!alive) return;
      if (session) {
        setServerUrl(session.server_url);
        isServerReachable(session.server_url).then((r) => {
          if (alive) setReachable(r);
        });
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  const serverName = serverUrl
    ? (() => {
        try {
          return new URL(serverUrl).hostname;
        } catch {
          return serverUrl;
        }
      })()
    : t("campus.account.server");

  return (
    <div className="max-w-3xl w-full mx-auto space-y-6">
      <div className="px-1 space-y-1">
        <h1 className="text-3xl font-semibold tracking-tight text-text">
          {t("campus.home.title")}
        </h1>
        <p className="text-base text-text-secondary">
          {t("campus.home.subtitle")}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
        <ActionCard
          icon={Mic}
          label={t("campus.home.action.dictate")}
          shortcut={transcribeBinding || "—"}
        />
        <ActionCard
          icon={X}
          label={t("campus.home.action.cancel")}
          shortcut={cancelBinding || "—"}
        />
        <ActionCard
          icon={Sparkles}
          label={t("campus.home.action.postProcess")}
          shortcut={postProcessBinding || "—"}
        />
        <ActionCard
          icon={FileAudio}
          label={t("campus.files.actionButton")}
          onClick={() => setIsFileModalOpen(true)}
        />
      </div>

      <CampusFileTranscribeModal
        isOpen={isFileModalOpen}
        onClose={() => setIsFileModalOpen(false)}
      />

      <div className="bg-white rounded-3xl border border-hairline shadow-sm p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles size={18} className="text-accent" strokeWidth={1.75} />
            <h2 className="text-base font-semibold">
              {t("campus.home.stylesTitle")}
            </h2>
          </div>
          <button
            type="button"
            onClick={() => onNavigate?.("postprocessing")}
            className="flex items-center gap-1 text-sm text-accent hover:underline"
          >
            {t("campus.home.seeAll")}
            <ChevronRight size={14} />
          </button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          {visibleStyles.map((style) => (
            <StyleMiniCard
              key={style.id}
              style={style}
              active={style.id === selectedPromptId}
            />
          ))}
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-hairline shadow-sm p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Shield size={18} className="text-success" strokeWidth={1.75} />
          <h2 className="text-base font-semibold">
            {t("campus.home.statusTitle")}
          </h2>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={`w-2.5 h-2.5 rounded-full ${
              reachable ? "bg-success" : "bg-orange-400"
            }`}
          />
          <span className="text-sm text-text-secondary">
            {reachable
              ? t("campus.home.connected", { server: serverName })
              : t("campus.home.offline", { server: serverName })}
          </span>
        </div>
        <p className="text-xs text-text-secondary/80 leading-relaxed">
          {t("campus.home.privacyNote")}
        </p>
      </div>
    </div>
  );
};

export default CampusHomeSettings;

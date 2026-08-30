import {
  useEffect,
  useState,
  useRef,
  type ReactNode,
  type ComponentType,
  Suspense,
} from "react";
import { toast, Toaster } from "sonner";
import { CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { platform } from "@tauri-apps/plugin-os";
import {
  checkAccessibilityPermission,
  checkMicrophonePermission,
} from "tauri-plugin-macos-permissions-api";
import { ModelStateEvent, RecordingErrorEvent } from "./lib/types/events";
import "./App.css";
import AccessibilityPermissions from "./components/AccessibilityPermissions";
import AppShell from "./components/shell/AppShell";
import NovaCommandsHost from "./components/commands/NovaCommandsHost";
import Onboarding, {
  AccessibilityOnboarding,
  EditionChoice,
  WritingStylesIntroStep,
  CampusOnboarding,
  CustomizeStep,
  SmartSetupStep,
  TutorialOnboarding,
  WelcomeStep,
} from "./components/onboarding";
import { SidebarSection, SECTIONS_CONFIG } from "./components/Sidebar";
import { WhatsNewGate } from "./components/whats-new";
import { LexiconSuggestions } from "./components/LexiconSuggestions";
import { useSettings } from "./hooks/useSettings";
import { useCampusStatus } from "./hooks/useCampusStatus";
import { useSystemReadiness } from "./hooks/useSystemReadiness";
import { useOnboardingFlow } from "./hooks/useOnboardingFlow";
import { reconcileWithLegacySetting } from "./lib/onboarding/progress";
import { useSettingsStore } from "./stores/settingsStore";
import { refreshCampusContext } from "./stores/campusStore";
import { commands } from "@/bindings";
import { getLanguageDirection, initializeRTL } from "@/lib/utils/rtl";
import {
  markAttentionSeen,
  showAttentionToast,
} from "@/lib/attentionNotifications";
import { isOrganizationMode } from "@/lib/mode";
import { chosenEdition, declaresEdition } from "@/lib/organization";
import {
  loadCampusSession,
  completeCampusOnboarding,
  clearCampusSession,
} from "@/lib/campusSession";

// Le parcours de première ouverture n'est plus une suite figée : il est
// calculé depuis l'état réel du système (voir `useOnboardingFlow`). App.tsx
// ne conserve donc qu'une question — s'agit-il d'une première ouverture ?

const renderSettingsContent = (
  section: SidebarSection,
  onNavigate: (section: SidebarSection) => void,
) => {
  // L'accueil renvoie vers d'autres sections ; les autres composants de
  // section n'attendent aucune prop.
  if (section === "home") {
    const Component = SECTIONS_CONFIG[section].component as ComponentType<{
      onNavigate?: (section: SidebarSection) => void;
    }>;
    return <Component onNavigate={onNavigate} />;
  }
  const ActiveComponent =
    SECTIONS_CONFIG[section]?.component || SECTIONS_CONFIG.home.component;
  return <ActiveComponent />;
};

function App() {
  const { t, i18n } = useTranslation();
  // `null` tant que l'état persisté n'a pas été lu.
  const [isFirstRun, setIsFirstRun] = useState<boolean | null>(null);
  const [customizing, setCustomizing] = useState(false);
  const [currentSection, setCurrentSection] = useState<SidebarSection>("home");

  const { settings, updateSetting } = useSettings();
  const readiness = useSystemReadiness();
  const { session: campusSessionState, refresh: refreshCampusStatus } =
    useCampusStatus();

  // Un paquet unifié doit savoir s'il est personnel ou d'organisation avant
  // que quoi que ce soit d'autre ne soit calculé : le parcours d'accueil fige
  // sa liste d'étapes, et l'étape de connexion Organization n'y entrerait plus
  // après coup. `editionSettled` ne bouge qu'une fois, quand l'utilisateur
  // répond. Un paquet qui déclare son édition est déjà réglé, donc ne voit
  // jamais cet écran.
  const [editionSettled, setEditionSettled] = useState(
    () => declaresEdition() || chosenEdition() !== null,
  );

  const flow = useOnboardingFlow({
    readiness,
    hasCampusSession: campusSessionState !== null,
    isFirstRun,
    onFinished: () => {
      updateSetting("onboarding_completed", true).catch((e) => {
        console.warn("Failed to persist onboarding completion:", e);
      });
      setIsFirstRun(false);
    },
  });
  const direction = getLanguageDirection(i18n.language);
  const refreshAudioDevices = useSettingsStore(
    (state) => state.refreshAudioDevices,
  );
  const refreshOutputDevices = useSettingsStore(
    (state) => state.refreshOutputDevices,
  );
  const hasCompletedPostOnboardingInit = useRef(false);

  useEffect(() => {
    checkOnboardingStatus();
  }, []);

  // Une session Organization peut déjà exister au lancement. Dans ce cas le
  // parcours de connexion ne se remonte pas, donc c'est l'application qui doit
  // amorcer l'identité, les policies et le catalogue de packages partagés.
  useEffect(() => {
    if (!isOrganizationMode()) return;
    void refreshCampusContext();
  }, []);

  // En mode campus, on informe le backend pour qu'il route les dictées vers le serveur.
  useEffect(() => {
    if (isOrganizationMode()) {
      commands.setCampusMode(true).catch((e) => {
        console.warn("Failed to set campus mode:", e);
      });
    }
  }, []);

  // Initialize RTL direction when language changes
  useEffect(() => {
    initializeRTL(i18n.language);
  }, [i18n.language]);

  // Initialize Enigo, shortcuts, and refresh audio devices when main app loads.
  // Les raccourcis sont enregistrés dès l'étape de première dictée (et pas
  // seulement à la fin) : sans ça, la dictée-test du premier lancement et
  // toute saisie de raccourci pendant le parcours échouaient silencieusement.
  useEffect(() => {
    const needsInit =
      flow.current === "firstDictation" ||
      flow.current === "smartSetup" ||
      (isFirstRun === false && flow.current === null);
    if (needsInit && !hasCompletedPostOnboardingInit.current) {
      hasCompletedPostOnboardingInit.current = true;
      Promise.all([
        commands.initializeEnigo(),
        commands.initializeShortcuts(),
      ]).catch((e) => {
        console.warn("Failed to initialize:", e);
      });
      refreshAudioDevices();
      refreshOutputDevices();
    }
  }, [flow.current, isFirstRun, refreshAudioDevices, refreshOutputDevices]);

  // Handle keyboard shortcuts for debug mode toggle
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Check for Ctrl+Shift+D (Windows/Linux) or Cmd+Shift+D (macOS)
      const isDebugShortcut =
        event.shiftKey &&
        event.key.toLowerCase() === "d" &&
        (event.ctrlKey || event.metaKey);

      if (isDebugShortcut) {
        event.preventDefault();
        const currentDebugMode = settings?.debug_mode ?? false;
        updateSetting("debug_mode", !currentDebugMode);
      }
    };

    // Add event listener when component mounts
    document.addEventListener("keydown", handleKeyDown);

    // Cleanup event listener when component unmounts
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [settings?.debug_mode, updateSetting]);

  // Listen for recording errors from the backend and show a toast
  useEffect(() => {
    const unlisten = listen<RecordingErrorEvent>("recording-error", (event) => {
      const { error_type, detail } = event.payload;

      if (error_type === "microphone_permission_denied") {
        const currentPlatform = platform();
        const platformKey = `errors.micPermissionDenied.${currentPlatform}`;
        const description = t(platformKey, {
          defaultValue: t("errors.micPermissionDenied.generic"),
        });
        showAttentionToast("error", t("errors.micPermissionDeniedTitle"), {
          description,
        });
      } else if (error_type === "no_input_device") {
        showAttentionToast("error", t("errors.noInputDeviceTitle"), {
          description: t("errors.noInputDevice"),
        });
      } else {
        console.warn("Recording failed:", detail);
        showAttentionToast("error", t("errors.recordingUnavailableTitle"));
      }
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [t]);

  // Listen for paste failures and show a toast.
  // The technical error detail is logged to handy.log on the Rust side
  // (see actions.rs `error!("Failed to paste transcription: ...")`),
  // so we show a localized, user-friendly message here instead of the raw error.
  useEffect(() => {
    const unlisten = listen("paste-error", () => {
      showAttentionToast("error", t("errors.pasteFailedTitle"), {
        description: t("errors.pasteFailed"),
      });
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [t]);

  // Listen for transcription failures and show a toast.
  // The payload is the backend error message (also logged to handy.log).
  useEffect(() => {
    const unlisten = listen<string>("transcription-error", (event) => {
      console.warn("Transcription failed:", event.payload);
      showAttentionToast("error", t("errors.transcriptionFailedTitle"));
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [t]);

  useEffect(() => {
    const unlisten = listen<string>("dictionary-word-added", (event) => {
      toast.success(t("voiceCommands.added", { word: event.payload }), {
        duration: 1500,
      });
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [t]);

  // Reformulation trop longue (moteur local ou réseau bloqué) : le texte brut
  // a été collé côté Rust après POST_PROCESS_TIMEOUT. On le signale.
  useEffect(() => {
    const unlisten = listen("post-process-timeout", () => {
      showAttentionToast("warning", t("errors.postProcessFallbackTitle"), {
        description: t("errors.postProcessFallback"),
      });
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [t]);

  useEffect(() => {
    const unlisten = listen("post-process-fallback", () => {
      showAttentionToast("warning", t("errors.postProcessFallbackTitle"), {
        description: t("errors.postProcessFallback"),
      });
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [t]);

  // Session campus révoquée (401) : retour à l'onboarding.
  useEffect(() => {
    const unlisten = listen("campus-session-invalid", () => {
      // La session disparue, `useCampusStatus` la relit et le parcours
      // réintroduit de lui-même l'étape de connexion.
      clearCampusSession()
        .then(() => {
          refreshCampusStatus();
          showAttentionToast("error", t("campus.sessionExpiredTitle"), {
            description: t("campus.sessionExpired"),
          });
        })
        .catch((e) => {
          console.error("Failed to clear campus session:", e);
          refreshCampusStatus();
        });
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [t]);

  // Serveur campus injoignable : repli local actif. Notification discrète,
  // dédupliquée (id fixe) et auto-masquée — pas de badge d'attention.
  useEffect(() => {
    const unlisten = listen("campus-server-unreachable", () => {
      toast.warning(t("campus.serverUnreachableTitle"), {
        id: "campus-server-unreachable",
        description: t("campus.serverUnreachable"),
        duration: 4000,
      });
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [t]);

  // Déconnexion demandée depuis la section Compte : retour à l'onboarding.
  useEffect(() => {
    const unlisten = listen("campus-logout-requested", () => {
      refreshCampusStatus();
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [refreshCampusStatus]);

  useEffect(() => {
    const unlisten = listen("notification-attention-seen", () => {
      markAttentionSeen();
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  // Le moteur en ligne est réservé à Nova Ultra : la reformulation a été
  // ignorée silencieusement côté Rust — on explique au lieu de laisser croire
  // à un bug. Inutile en mode campus (tout est débloqué par l'établissement).
  useEffect(() => {
    if (isOrganizationMode()) return;
    const unlisten = listen("online-engine-locked", () => {
      showAttentionToast("info", t("license.onlineEngineLockedTitle"), {
        description: t("license.onlineEngineLocked"),
      });
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [t]);

  // Le micro choisi dans les réglages n'existe plus : le micro par défaut est
  // utilisé à la place. Sans ce toast, le repli était invisible.
  useEffect(() => {
    const unlisten = listen<string>("microphone-not-found", (event) => {
      showAttentionToast("warning", t("errors.microphoneNotFoundTitle"), {
        description: t("errors.microphoneNotFound", { name: event.payload }),
      });
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [t]);

  // Quota gratuit de reformulations épuisé : le texte a été collé brut côté
  // Rust. On informe et on propose de passer à un palier supérieur. Inutile en
  // mode campus (pas de quota).
  useEffect(() => {
    if (isOrganizationMode()) return;
    const unlisten = listen("quota-blocked", () => {
      showAttentionToast("error", t("quota.blockedTitle"), {
        description: t("quota.blockedDescription"),
        action: {
          label: t("quota.upgrade"),
          onClick: () => {
            void openUrl("https://buy.stripe.com/9B68wO1Wif1g3Kfg7YefC09");
          },
        },
      });
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [t]);

  // Mode CPU forcé (le pilote graphique a bloqué l'init du moteur lors d'un
  // lancement précédent) : informer une fois par ouverture de l'app, avec le
  // chemin de réactivation du GPU.
  useEffect(() => {
    commands
      .isTranscribeCpuOnlyMode()
      .then((cpuOnly) => {
        if (cpuOnly) {
          showAttentionToast("warning", t("errors.performanceReducedTitle"), {
            description: t("errors.performanceReduced"),
          });
        }
      })
      .catch(() => {});
  }, [t]);

  // Listen for model loading failures and show a toast
  useEffect(() => {
    const unlisten = listen<ModelStateEvent>("model-state-changed", (event) => {
      if (event.payload.event_type === "loading_failed") {
        showAttentionToast("error", t("errors.privateEngineUnavailable"));
      }
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [t]);

  const revealMainWindowForPermissions = async () => {
    try {
      await commands.showMainWindowCommand();
    } catch (e) {
      console.warn("Failed to show main window for permission onboarding:", e);
    }
  };

  /**
   * Détermine une seule chose : s'agit-il d'une première ouverture ?
   *
   * Le reste du parcours est calculé depuis l'état système par
   * `useOnboardingFlow`. Un utilisateur qui se servait déjà de Nova est
   * reconnu par le réglage historique `onboarding_completed` (ou, en campus,
   * par une session valide) et ne verra jamais la présentation ni la
   * configuration initiale — seulement d'éventuelles étapes correctives.
   */
  const checkOnboardingStatus = async () => {
    try {
      const settingsResult = await commands.getAppSettings();
      const hasCompletedOnboarding =
        settingsResult.status === "ok" &&
        settingsResult.data.onboarding_completed === true;

      let campusSession = null;
      if (isOrganizationMode()) {
        campusSession = await loadCampusSession();
        if (campusSession && !hasCompletedOnboarding) {
          await completeCampusOnboarding().catch(() => {});
        }
      }

      const alreadyConfigured =
        hasCompletedOnboarding || campusSession !== null;
      reconcileWithLegacySetting(alreadyConfigured);
      setIsFirstRun(!alreadyConfigured);

      // Une permission révoquée doit pouvoir être réaccordée : sur un
      // lancement démarré en arrière-plan, la fenêtre doit alors se montrer.
      if (alreadyConfigured) {
        const currentPlatform = platform();
        try {
          if (currentPlatform === "macos") {
            const [hasAccessibility, hasMicrophone] = await Promise.all([
              checkAccessibilityPermission(),
              checkMicrophonePermission(),
            ]);
            if (!hasAccessibility || !hasMicrophone) {
              await revealMainWindowForPermissions();
            }
          } else if (currentPlatform === "windows") {
            const status =
              await commands.getWindowsMicrophonePermissionStatus();
            if (status.supported && status.overall_access === "denied") {
              await revealMainWindowForPermissions();
            }
          }
        } catch (e) {
          console.warn("Failed to check permissions:", e);
        }
      }
    } catch (error) {
      console.error("Failed to check onboarding status:", error);
      // En cas d'échec de lecture, on traite comme une première ouverture :
      // mieux vaut un parcours de trop qu'une application inutilisable.
      setIsFirstRun(true);
    }
  };

  // Rendered once around every step below (including onboarding) so
  // toast.error() calls surface to the user. sonner renders via a portal, so
  // its position in the tree doesn't affect layout. Without this, errors during
  // onboarding (e.g. a model download failing because blob.handy.computer is
  // unreachable) are silently swallowed and the wizard just appears to "blink".
  const toaster = (
    <Toaster
      theme="system"
      icons={{
        success: <CircleCheck size={18} strokeWidth={2} aria-hidden="true" />,
        info: <Info size={18} strokeWidth={2} aria-hidden="true" />,
        warning: <TriangleAlert size={18} strokeWidth={2} aria-hidden="true" />,
        error: <CircleAlert size={18} strokeWidth={2} aria-hidden="true" />,
      }}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            "bg-background border border-mid-gray/20 rounded-lg shadow-lg px-4 py-3 flex items-center gap-3 text-sm",
          title: "font-medium",
          description: "text-mid-gray",
        },
      }}
    />
  );

  // Avant tout le reste : quelle édition ? La question précède le parcours,
  // elle n'en fait pas partie. Choisir « Personnel » ici n'émet aucune requête.
  if (!editionSettled) {
    return (
      <>
        <EditionChoice onChosen={() => setEditionSettled(true)} />
        {toaster}
      </>
    );
  }

  // L'état système n'est pas encore connu : ne rien afficher plutôt que de
  // faire clignoter un écran de parcours qui sera peut-être sauté.
  if (isFirstRun === null || !readiness.loaded || !flow.initialized) {
    return null;
  }

  // Select the content for the current step. The Toaster is rendered once, in a
  // stable wrapper around this node, so crossing between onboarding steps and
  // the main app never remounts it (which would drop any in-flight toast).
  let content: ReactNode;
  if (flow.current === "permissions") {
    content = <AccessibilityOnboarding onComplete={flow.next} />;
  } else if (flow.current === "campus") {
    content = (
      <CampusOnboarding
        flowContext="onboarding"
        onComplete={() => {
          refreshCampusStatus();
          flow.next();
        }}
      />
    );
  } else if (flow.current === "welcome") {
    content = <WelcomeStep onContinue={flow.next} />;
  } else if (flow.current === "model") {
    content = (
      <Onboarding
        onModelSelected={() => {
          readiness.refresh();
          flow.next();
        }}
      />
    );
  } else if (flow.current === "smartSetup") {
    content = customizing ? (
      <CustomizeStep
        stepIndex={flow.displayIndex}
        stepCount={flow.displayCount}
        onBack={() => setCustomizing(false)}
        onContinue={() => {
          setCustomizing(false);
          flow.next();
        }}
      />
    ) : (
      <SmartSetupStep
        readiness={readiness}
        stepIndex={flow.displayIndex}
        stepCount={flow.displayCount}
        onBack={flow.canGoBack ? flow.back : undefined}
        onAccept={flow.next}
        onCustomize={() => setCustomizing(true)}
      />
    );
  } else if (flow.current === "writingStyles") {
    content = (
      <WritingStylesIntroStep
        stepIndex={flow.displayIndex}
        stepCount={flow.displayCount}
        onBack={flow.back}
        onContinue={flow.next}
        onSkip={flow.skip}
      />
    );
  } else if (flow.current === "firstDictation") {
    content = (
      <TutorialOnboarding
        stepIndex={flow.displayIndex}
        stepCount={flow.displayCount}
        onDone={flow.next}
      />
    );
  } else {
    content = (
      <AppShell
        dir={direction}
        activeSection={currentSection}
        onSectionChange={setCurrentSection}
        banner={
          <>
            <WhatsNewGate />
            <LexiconSuggestions />
            <AccessibilityPermissions />
          </>
        }
      >
        <Suspense
          fallback={
            <div className="flex justify-center py-16" role="status">
              <div className="w-7 h-7 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            </div>
          }
        >
          {renderSettingsContent(currentSection, setCurrentSection)}
        </Suspense>
      </AppShell>
    );
  }

  return (
    <>
      {toaster}
      {content}
      {/* Monté hors du shell : la palette est déclenchée par un raccourci
          global et ne dépend d'aucun écran en particulier. */}
      <NovaCommandsHost />
    </>
  );
}

export default App;

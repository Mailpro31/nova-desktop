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
import Footer from "./components/footer";
import Onboarding, {
  AccessibilityOnboarding,
  CampusOnboarding,
  StyleOnboarding,
  QuickVariablesOnboarding,
  TutorialOnboarding,
} from "./components/onboarding";
import { Sidebar, SidebarSection, SECTIONS_CONFIG } from "./components/Sidebar";
import { WhatsNewGate } from "./components/whats-new";
import { LexiconSuggestions } from "./components/LexiconSuggestions";
import { useSettings } from "./hooks/useSettings";
import { useSettingsStore } from "./stores/settingsStore";
import { commands } from "@/bindings";
import { getLanguageDirection, initializeRTL } from "@/lib/utils/rtl";
import {
  markAttentionSeen,
  showAttentionToast,
} from "@/lib/attentionNotifications";
import { isCampusMode } from "@/lib/mode";
import {
  loadCampusSession,
  completeCampusOnboarding,
  clearCampusSession,
} from "@/lib/campusSession";
import CampusStatusBubble from "./components/CampusStatusBubble";

type OnboardingStep =
  | "accessibility"
  | "model"
  | "campus"
  | "style"
  | "variables"
  | "tutorial"
  | "done";

// Étapes ajoutées après l'onboarding initial (modèle ou campus), dans l'ordre
// où elles s'enchaînent — sert à calculer l'index/le total affichés par le
// repère de progression à pastilles (`OnboardingStepShell`).
const POST_MODEL_STEPS: OnboardingStep[] = ["style", "variables", "tutorial"];

const renderSettingsContent = (
  section: SidebarSection,
  onNavigate: (section: SidebarSection) => void,
) => {
  // Accueil a besoin de naviguer vers d'autres sections (accès rapide) ; les
  // autres composants de section n'attendent aucune prop.
  if (section === "home") {
    const HomeComponent = SECTIONS_CONFIG.home.component as ComponentType<{
      onNavigate?: (section: SidebarSection) => void;
    }>;
    return <HomeComponent onNavigate={onNavigate} />;
  }
  const ActiveComponent =
    SECTIONS_CONFIG[section]?.component || SECTIONS_CONFIG.home.component;
  return <ActiveComponent />;
};

function App() {
  const { t, i18n } = useTranslation();
  const [onboardingStep, setOnboardingStep] = useState<OnboardingStep | null>(
    null,
  );
  // Track if this is a returning user who just needs to grant permissions
  // (vs a new user who needs full onboarding including model selection)
  const [isReturningUser, setIsReturningUser] = useState(false);
  const [currentSection, setCurrentSection] = useState<SidebarSection>("home");
  const { settings, updateSetting } = useSettings();
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

  // En mode campus, on informe le backend pour qu'il route les dictées vers le serveur.
  useEffect(() => {
    if (isCampusMode()) {
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
  // Les raccourcis sont enregistrés dès l'étape « tutorial » (et pas seulement
  // à « done ») : sans ça, la dictée-test du premier lancement et toute
  // saisie de raccourci pendant l'onboarding échouaient silencieusement.
  useEffect(() => {
    const needsInit =
      onboardingStep === "tutorial" || onboardingStep === "done";
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
  }, [onboardingStep, refreshAudioDevices, refreshOutputDevices]);

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
      clearCampusSession()
        .then(() => {
          setOnboardingStep("campus");
          showAttentionToast("error", t("campus.sessionExpiredTitle"), {
            description: t("campus.sessionExpired"),
          });
        })
        .catch((e) => {
          console.error("Failed to clear campus session:", e);
          setOnboardingStep("campus");
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
      setOnboardingStep("campus");
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

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
    if (isCampusMode()) return;
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
    if (isCampusMode()) return;
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

  const checkOnboardingStatus = async () => {
    try {
      const settingsResult = await commands.getAppSettings();
      const hasCompletedOnboarding =
        settingsResult.status === "ok" &&
        settingsResult.data.onboarding_completed === true;
      const currentPlatform = platform();

      // En mode campus, une session valide équivaut à un onboarding terminé.
      let campusSession = null;
      if (isCampusMode()) {
        campusSession = await loadCampusSession();
        if (campusSession && !hasCompletedOnboarding) {
          await completeCampusOnboarding().catch(() => {});
        }
      }

      if (hasCompletedOnboarding || campusSession !== null) {
        // Returning user - check if they need to grant permissions first
        setIsReturningUser(true);

        if (currentPlatform === "macos") {
          try {
            const [hasAccessibility, hasMicrophone] = await Promise.all([
              checkAccessibilityPermission(),
              checkMicrophonePermission(),
            ]);
            if (!hasAccessibility || !hasMicrophone) {
              await revealMainWindowForPermissions();
              setOnboardingStep("accessibility");
              return;
            }
          } catch (e) {
            console.warn("Failed to check macOS permissions:", e);
            // If we can't check, proceed to main app and let them fix it there
          }
        }

        if (currentPlatform === "windows") {
          try {
            const microphoneStatus =
              await commands.getWindowsMicrophonePermissionStatus();
            if (
              microphoneStatus.supported &&
              microphoneStatus.overall_access === "denied"
            ) {
              await revealMainWindowForPermissions();
              setOnboardingStep("accessibility");
              return;
            }
          } catch (e) {
            console.warn("Failed to check Windows microphone permissions:", e);
            // If we can't check, proceed to main app and let them fix it there
          }
        }

        setOnboardingStep("done");
      } else {
        // New user - start full onboarding
        setIsReturningUser(false);
        setOnboardingStep("accessibility");
      }
    } catch (error) {
      console.error("Failed to check onboarding status:", error);
      setOnboardingStep("accessibility");
    }
  };

  const handleAccessibilityComplete = () => {
    // Returning users already have models, skip to main app
    // New users need to select a model (personal) or authenticate (campus)
    if (isReturningUser) {
      setOnboardingStep("done");
    } else if (isCampusMode()) {
      setOnboardingStep("campus");
    } else {
      setOnboardingStep("model");
    }
  };

  const handleModelSelected = () => {
    // Modèle choisi (téléchargement lancé) : enchaîne sur les étapes
    // ajoutées — choix du Style, raccourcis personnels, puis mini-tutoriel —
    // avant de basculer sur l'app principale.
    setOnboardingStep("style");
  };

  const handleCampusOnboardingComplete = () => {
    setOnboardingStep("style");
  };

  const handleStyleDone = () => {
    setOnboardingStep("variables");
  };

  const handleVariablesDone = () => {
    setOnboardingStep("tutorial");
  };

  const handleTutorialDone = () => {
    setOnboardingStep("done");
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

  // Still checking onboarding status
  if (onboardingStep === null) {
    return null;
  }

  // Select the content for the current step. The Toaster is rendered once, in a
  // stable wrapper around this node, so crossing between onboarding steps and
  // the main app never remounts it (which would drop any in-flight toast).
  let content: ReactNode;
  if (onboardingStep === "accessibility") {
    content = (
      <AccessibilityOnboarding onComplete={handleAccessibilityComplete} />
    );
  } else if (onboardingStep === "model") {
    content = <Onboarding onModelSelected={handleModelSelected} />;
  } else if (onboardingStep === "campus") {
    content = <CampusOnboarding onComplete={handleCampusOnboardingComplete} />;
  } else if (onboardingStep === "style") {
    content = (
      <StyleOnboarding
        stepIndex={POST_MODEL_STEPS.indexOf("style")}
        stepCount={POST_MODEL_STEPS.length}
        onDone={handleStyleDone}
      />
    );
  } else if (onboardingStep === "variables") {
    content = (
      <QuickVariablesOnboarding
        stepIndex={POST_MODEL_STEPS.indexOf("variables")}
        stepCount={POST_MODEL_STEPS.length}
        onDone={handleVariablesDone}
      />
    );
  } else if (onboardingStep === "tutorial") {
    content = (
      <TutorialOnboarding
        stepIndex={POST_MODEL_STEPS.indexOf("tutorial")}
        stepCount={POST_MODEL_STEPS.length}
        onDone={handleTutorialDone}
      />
    );
  } else {
    content = (
      <div
        dir={direction}
        className="h-screen flex flex-col select-none cursor-default"
      >
        <WhatsNewGate />
        <LexiconSuggestions />
        {/* Main content area that takes remaining space */}
        <div className="flex-1 flex overflow-hidden">
          <Sidebar
            activeSection={currentSection}
            onSectionChange={setCurrentSection}
          />
          {/* Scrollable content area */}
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto">
              <div className="flex flex-col items-center p-4 gap-4">
                <AccessibilityPermissions />
                <Suspense
                  fallback={
                    <div className="flex justify-center py-16" role="status">
                      <div className="w-7 h-7 border-2 border-logo-primary border-t-transparent rounded-full animate-spin" />
                    </div>
                  }
                >
                  {renderSettingsContent(currentSection, setCurrentSection)}
                </Suspense>
              </div>
            </div>
          </div>
        </div>
        {/* Fixed footer at bottom */}
        <Footer />
      </div>
    );
  }

  return (
    <>
      {toaster}
      {content}
      {isCampusMode() && <CampusStatusBubble />}
    </>
  );
}

export default App;

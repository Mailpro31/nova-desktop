import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { hostname } from "@tauri-apps/plugin-os";
import { openUrl } from "@tauri-apps/plugin-opener";
import { invoke } from "@tauri-apps/api/core";
import { Check } from "lucide-react";
import HandyTextLogo from "../icons/HandyTextLogo";
import OnboardingStepShell from "./OnboardingStepShell";
import {
  CampusApi,
  CampusApiError,
  type CampusEntraStartResponse,
  type CampusProfile,
} from "@/lib/campusApi";
import {
  loadCampusConfig,
  loadCampusServerConfig,
  type CampusConfig,
} from "@/lib/campusSession";
import {
  isValidCampusEmail,
  isValidCampusServerUrl,
  maskCampusEmail,
  normalizeCampusServerUrl,
  sanitizeCampusCode,
  shouldShowCampusServerInput,
} from "@/lib/campusOnboarding";
import {
  campusOrganizationLabel,
  resolveCampusContext,
} from "@/lib/campusPolicy";
import { ManagedBy } from "@/components/campus/ManagedBy";
import { commands, type SsoProvider } from "@/bindings";
import { formatSsoError } from "@/lib/organization/ssoErrors";
import {
  organizationSignInButtons,
  type AnnouncedProviders,
} from "@/lib/organization/ssoProviders";
import { organizationKindIntent } from "@/lib/organization/editionChoice";
import { refreshCampusContext } from "@/stores/campusStore";
import {
  IS_LAB_BUILD,
  labServer,
  markLabEnrolled,
  rememberLabServer,
} from "@/lib/lab";
import { useCampusStatus } from "@/hooks/useCampusStatus";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

type CampusStep = "welcome" | "lab" | "email" | "code" | "ready";

const DEFAULT_DISCOVERY_ORIGIN = "https://api.novaspeak.app";

interface ManagedDeploymentState {
  managed: boolean;
  organization_id: string | null;
  control_plane_origin: string | null;
  error: string | null;
}

// Le code Lab est explicitement absent du paquet Desktop habituel : cette
// surface ne s'affiche que dans l'artefact de test bâti avec la feature Rust
// `lab` et la variable Vite correspondante — voir `@/lib/lab`.

interface CampusOnboardingProps {
  /**
   * Le parcours d'authentification est partagé, mais sa sortie dépend de la
   * surface qui l'a ouvert : le premier lancement présente un récapitulatif,
   * tandis que Settings revient immédiatement dans Nova.
   */
  flowContext: "onboarding" | "settings";
  onComplete: () => void;
}

interface CodeInputProps {
  value: string;
  onChange: (value: string) => void;
  onComplete: () => void;
  disabled?: boolean;
  invalid?: boolean;
  digitLabel: (position: number) => string;
}

const CodeInput: React.FC<CodeInputProps> = ({
  value,
  onChange,
  onComplete,
  disabled,
  invalid,
  digitLabel,
}) => {
  const digits = value.split("").concat(Array(6 - value.length).fill(""));
  const inputsRef = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    inputsRef.current[0]?.focus();
  }, []);

  const replaceDigit = (index: number, input: string) => {
    const digit = sanitizeCampusCode(input).slice(-1);
    if (!digit && input) return;
    const next = `${value.slice(0, index)}${digit}${value.slice(index + 1)}`;
    onChange(sanitizeCampusCode(next));
    if (digit && index < 5) inputsRef.current[index + 1]?.focus();
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = sanitizeCampusCode(event.clipboardData.getData("text"));
    if (!pasted) return;
    event.preventDefault();
    onChange(pasted);
    inputsRef.current[Math.min(pasted.length, 6) - 1]?.focus();
  };

  return (
    <div
      className="mx-auto grid w-full max-w-[304px] grid-cols-6 gap-1.5"
      role="group"
    >
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(element) => {
            inputsRef.current[index] = element;
          }}
          type="text"
          inputMode="numeric"
          autoComplete={index === 0 ? "one-time-code" : "off"}
          maxLength={1}
          value={digit}
          disabled={disabled}
          aria-label={digitLabel(index + 1)}
          aria-invalid={invalid || undefined}
          onPaste={handlePaste}
          onChange={(event) => replaceDigit(index, event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Backspace" && !value[index] && index > 0) {
              inputsRef.current[index - 1]?.focus();
            } else if (event.key === "ArrowLeft" && index > 0) {
              inputsRef.current[index - 1]?.focus();
            } else if (event.key === "ArrowRight" && index < 5) {
              inputsRef.current[index + 1]?.focus();
            } else if (event.key === "Enter" && value.length === 6) {
              onComplete();
            }
          }}
          className={`h-12 min-w-0 w-full border bg-inset text-center text-lg font-semibold text-text outline-none [border-radius:var(--nova-radius-control)] transition-[background-color,border-color,box-shadow] duration-150 focus:bg-surface focus:ring-2 disabled:cursor-not-allowed disabled:opacity-55 ${
            invalid
              ? "border-danger focus:border-danger focus:ring-danger/20"
              : "border-hairline focus:border-accent focus:ring-accent/20"
          }`}
        />
      ))}
    </div>
  );
};

const CampusOnboarding: React.FC<CampusOnboardingProps> = ({
  flowContext,
  onComplete,
}) => {
  const { t } = useTranslation();
  const { refresh: refreshCampusStatus } = useCampusStatus();
  const [step, setStep] = useState<CampusStep>("welcome");
  const [email, setEmail] = useState("");
  const [serverUrl, setServerUrl] = useState("");
  const [config, setConfig] = useState<CampusConfig | null>(null);
  const [configLoaded, setConfigLoaded] = useState(false);
  const [managedBootstrap, setManagedBootstrap] = useState(false);
  const [bootstrapAttempt, setBootstrapAttempt] = useState(0);
  const [providersLoaded, setProvidersLoaded] = useState(false);
  // Ce que l'établissement propose réellement. Le poste ne le devine pas, il le
  // demande au serveur — un serveur plus ancien répond simplement « rien ».
  const [ssoProviders, setSsoProviders] = useState<AnnouncedProviders>({
    microsoft_entra: false,
    google_workspace: false,
    oidc: false,
    oidc_display_name: null,
  });
  const [code, setCode] = useState("");
  const [labCode, setLabCode] = useState("");
  const [machineName, setMachineName] = useState("unknown");
  const [profile, setProfile] = useState<CampusProfile | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [microsoftFlow, setMicrosoftFlow] =
    useState<CampusEntraStartResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const lastSubmittedCode = useRef("");

  useEffect(() => {
    let mounted = true;
    // `loadCampusConfig()` n'était pas protégée : un rejet emportait le
    // `Promise.all`, le `.then` ne s'exécutait jamais et `configLoaded`
    // restait faux — c'est-à-dire tous les boutons de cet écran désactivés,
    // définitivement, sans message. Chaque sonde répond désormais pour
    // elle-même, et l'écran s'affiche même si les deux échouent.
    setConfigLoaded(false);
    setError(null);
    void Promise.all([
      hostname().catch(() => null),
      loadCampusConfig().catch(() => null),
      invoke<ManagedDeploymentState>("get_deployment_state").catch(() => null),
    ]).then(async ([name, loadedConfig, deployment]) => {
      if (!mounted) return;
      setMachineName(name ?? "unknown");

      if (deployment?.error) {
        setManagedBootstrap(true);
        setConfig(loadedConfig);
        setError(t("organizationOnboarding.errors.managedConfiguration"));
        setConfigLoaded(true);
        return;
      }

      const deployedOrganization =
        deployment?.managed &&
        deployment.organization_id &&
        deployment.control_plane_origin
          ? {
              organization: deployment.organization_id,
              origin: deployment.control_plane_origin,
            }
          : null;
      const configuredOrganization =
        loadedConfig?.bootstrap_mode === "discovery" &&
        loadedConfig.organization_code
          ? {
              organization: loadedConfig.organization_code,
              origin: DEFAULT_DISCOVERY_ORIGIN,
            }
          : null;
      const discovery = deployedOrganization ?? configuredOrganization;

      if (discovery) {
        setManagedBootstrap(true);
        const result = await commands.discoverOrganization(
          discovery.origin,
          discovery.organization,
          false,
        );
        if (!mounted) return;
        if (result.status === "error") {
          setConfig({
            ...loadedConfig,
            organization_code: discovery.organization,
            bootstrap_mode: "discovery",
            organization: loadedConfig?.organization ?? {
              id: discovery.organization,
              name: discovery.organization,
              managed: true,
            },
          });
          setError(
            result.error.code === "OrganizationNotAvailable"
              ? t("organizationOnboarding.errors.organizationUnavailable")
              : t("organizationOnboarding.errors.discovery"),
          );
          setConfigLoaded(true);
          return;
        }

        const discoveredConfig: CampusConfig = {
          ...loadedConfig,
          server_url: result.data.service_endpoint,
          organization_code: result.data.organization,
          bootstrap_mode: "discovery",
          organization: loadedConfig?.organization ?? {
            id: result.data.organization,
            name: result.data.display_name,
            managed: true,
          },
        };
        setConfig(discoveredConfig);
        setServerUrl(result.data.service_endpoint);
        setConfigLoaded(true);
        return;
      }

      setManagedBootstrap(false);
      setConfig(loadedConfig);
      // Sur un poste Lab, l'adresse vient de l'invitation déjà acceptée : il
      // n'y a pas de configuration Campus locale à lire sur un PC de
      // démonstration, et il ne doit pas y en avoir besoin.
      setServerUrl(loadedConfig?.server_url ?? labServer() ?? "");
      setConfigLoaded(true);
    });
    return () => {
      mounted = false;
    };
  }, [bootstrapAttempt, t]);

  useEffect(() => {
    if (!isValidCampusServerUrl(serverUrl)) return;
    let active = true;
    const timer = window.setTimeout(() => {
      void loadCampusServerConfig(normalizeCampusServerUrl(serverUrl)).then(
        (remoteConfig) => {
          if (active && remoteConfig) {
            setConfig((current) => ({
              ...remoteConfig,
              organization_code:
                current?.organization_code ?? remoteConfig.organization_code,
              bootstrap_mode:
                current?.bootstrap_mode ?? remoteConfig.bootstrap_mode,
            }));
          }
        },
      );
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [serverUrl]);

  /**
   * Le poste ne décide pas seul quel fournisseur proposer : il demande au
   * serveur ce qu'il sait faire. Un établissement resté au code par adresse ne
   * verra donc jamais apparaître un bouton Microsoft inopérant, et un
   * établissement Microsoft obtient le flux moderne sans configuration locale.
   */
  useEffect(() => {
    setProvidersLoaded(false);
    if (!isValidCampusServerUrl(serverUrl)) {
      setSsoProviders({
        microsoft_entra: false,
        google_workspace: false,
        oidc: false,
        oidc_display_name: null,
      });
      return;
    }
    let active = true;
    void commands
      .organizationAuthProviders(normalizeCampusServerUrl(serverUrl))
      .then((result) => {
        if (!active) return;
        setSsoProviders(
          result.status === "ok"
            ? {
                microsoft_entra: result.data.microsoft_entra,
                google_workspace: result.data.google_workspace,
                oidc: result.data.oidc,
                oidc_display_name: result.data.oidc_display_name,
                configs: result.data.configs,
              }
            : {
                microsoft_entra: false,
                google_workspace: false,
                oidc: false,
                oidc_display_name: null,
              },
        );
      })
      .catch(() => {
        if (active)
          setSsoProviders({
            microsoft_entra: false,
            google_workspace: false,
            oidc: false,
            oidc_display_name: null,
          });
      })
      .finally(() => {
        if (active) setProvidersLoaded(true);
      });
    return () => {
      active = false;
    };
  }, [serverUrl]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(
      () => setCooldown((value) => value - 1),
      1000,
    );
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  const api = useMemo(
    () => new CampusApi(normalizeCampusServerUrl(serverUrl)),
    [serverUrl],
  );
  const context = useMemo(
    () => resolveCampusContext(config, profile),
    [config, profile],
  );
  const business = config?.organization_type
    ? config.organization_type === "business"
    : organizationKindIntent() === "business";
  const emailCodeAvailable = context.authMethods.includes("email_code");
  const signInButtons = organizationSignInButtons({
    edition: "organization",
    providers: ssoProviders,
    authMethods: context.authMethods,
  }).filter((provider) =>
    ["microsoft_entra", "google_workspace", "oidc"].includes(provider.type),
  );

  /**
   * Termine le flow sans dupliquer discovery ni authentification.
   *
   * Le contexte Organization est rafraîchi par chaque chemin d'authentification
   * avant cet appel. Settings peut donc fermer le flow immédiatement ; le
   * premier lancement, lui, conserve son écran récapitulatif historique.
   */
  const finishFlow = useCallback(() => {
    if (flowContext === "settings") {
      onComplete();
      return;
    }
    setStep("ready");
  }, [flowContext, onComplete]);

  /**
   * Relit les deux projections encore consommées par l'interface Campus.
   *
   * Le store Organization porte le profil et les packages, tandis que la
   * navigation historique lit encore `useCampusStatus` pour savoir si une
   * session existe. Rafraîchir seulement le premier chargeait bien `/api/me`
   * et le catalogue, mais laissait Settings et la sidebar visuellement
   * déconnectés jusqu'au redémarrage suivant.
   */
  const refreshConnectedCampusState = useCallback(async () => {
    await Promise.all([refreshCampusContext(), refreshCampusStatus()]);
  }, [refreshCampusStatus]);

  const formatError = useCallback(
    (caught: unknown): string => {
      if (caught instanceof CampusApiError) {
        const message = caught.message.toLowerCase();
        if (
          message.includes("network error") ||
          message.includes("injoignable") ||
          caught.status === 0
        ) {
          return t("campus.onboarding.errors.network");
        }
        return caught.message;
      }
      return t("campus.onboarding.errors.network");
    },
    [t],
  );

  const handleRequestCode = async () => {
    if (
      !emailCodeAvailable ||
      !isValidCampusEmail(email) ||
      !isValidCampusServerUrl(serverUrl)
    )
      return;
    setIsLoading(true);
    setError(null);
    try {
      await api.requestAuth(email.trim(), machineName);
      setCooldown(60);
      setStep("code");
    } catch (caught) {
      setError(formatError(caught));
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Un Lab se rejoint par une invitation à usage unique, jamais par une IP
   * saisie. Le backend vérifie d'abord le certificat épinglé par ce code ; le
   * navigateur ne reçoit ni le jeton du périphérique ni le certificat.
   */
  const handleLabEnrollment = async () => {
    if (!labCode.trim()) return;
    setIsLoading(true);
    setError(null);
    try {
      const enrolled = await invoke<{ service_endpoint: string }>(
        "enroll_lab_device",
        { code: labCode, deviceName: machineName },
      );
      rememberLabServer(enrolled.service_endpoint);
      markLabEnrolled();
      const labConfig = await loadCampusServerConfig(enrolled.service_endpoint);
      if (!labConfig) throw new Error("LAB_CONFIGURATION_UNAVAILABLE");
      setServerUrl(enrolled.service_endpoint);
      setConfig(labConfig);
      setStep("email");
    } catch {
      setError(t("campus.onboarding.lab.error"));
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendCode = async () => {
    if (cooldown > 0) return;
    setIsLoading(true);
    setError(null);
    try {
      await api.requestAuth(email.trim(), machineName);
      setCooldown(60);
      toast.success(t("campus.onboarding.code.resent"));
    } catch (caught) {
      setError(formatError(caught));
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Connexion Microsoft.
   *
   * Deux chemins derrière un seul bouton. Quand l'établissement a configuré le
   * SSO moderne, c'est Authorization Code + PKCE qui s'exécute : le navigateur
   * système s'ouvre et Nova reprend la main toute seule. Sinon, on retombe sur
   * le Device Code historique, avec son code à recopier.
   *
   * L'utilisateur ne voit pas la différence, et n'a rien à savoir de PKCE, du
   * tenant ou de l'identifiant d'application.
   */
  const handleStartSso = async (
    provider: SsoProvider,
    providerConfigId: string | null = null,
  ) => {
    if (!isValidCampusServerUrl(serverUrl) || isLoading) return;
    setIsLoading(true);
    setError(null);
    try {
      if (provider !== "microsoft_entra" || ssoProviders.microsoft_entra) {
        const result = await commands.signInWithOrganization(
          provider,
          serverUrl,
          machineName,
          providerConfigId,
          // Renseigné quand le poste a découvert son organisation : le
          // trousseau suit alors l'organisation plutôt que l'adresse.
          config?.organization_code ?? null,
        );
        if (result.status === "error") {
          setError(formatSsoError(result.error, t));
          return;
        }
        const loadedProfile = await api.getMe().catch(() => null);
        setEmail(result.data.email);
        setProfile(loadedProfile);
        await refreshConnectedCampusState();
        finishFlow();
        return;
      }

      // Repli hérité : Device Code, qui n'existe que chez Microsoft.
      const flow = await api.startMicrosoftAuth(machineName);
      setMicrosoftFlow(flow);
      await openUrl(flow.verification_uri_complete ?? flow.verification_uri);
    } catch (caught) {
      setError(formatError(caught));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!microsoftFlow) return;
    let active = true;
    let timer: number | undefined;

    const poll = async () => {
      try {
        const result = await api.pollMicrosoftAuth(microsoftFlow.flow_id);
        if (!active) return;
        if (result.status === "complete") {
          const loadedProfile = await api.getMe().catch(() => null);
          if (!active) return;
          setEmail(result.email ?? loadedProfile?.email ?? "");
          setProfile(loadedProfile);
          setMicrosoftFlow(null);
          await refreshConnectedCampusState();
          if (active) finishFlow();
          return;
        }
        if (result.status === "expired") {
          setMicrosoftFlow(null);
          setError(t("campus.microsoft.expired"));
          return;
        }
        const retrySeconds = result.retry_after ?? microsoftFlow.interval;
        timer = window.setTimeout(poll, Math.max(1, retrySeconds) * 1000);
      } catch (caught) {
        if (!active) return;
        setMicrosoftFlow(null);
        setError(formatError(caught));
      }
    };

    timer = window.setTimeout(poll, Math.max(1, microsoftFlow.interval) * 1000);
    return () => {
      active = false;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [
    api,
    finishFlow,
    formatError,
    microsoftFlow,
    refreshConnectedCampusState,
    t,
  ]);

  const handleVerifyCode = useCallback(async () => {
    if (code.length !== 6 || isLoading || lastSubmittedCode.current === code) {
      return;
    }
    lastSubmittedCode.current = code;
    setIsLoading(true);
    setError(null);
    try {
      await api.verifyAuth(email.trim(), code, machineName);
      const loadedProfile = await api.getMe().catch(() => null);
      setProfile(loadedProfile);
      await refreshConnectedCampusState();
      finishFlow();
    } catch (caught) {
      let message = formatError(caught);
      if (caught instanceof CampusApiError) {
        if (caught.status === 400) {
          message = t("campus.onboarding.code.invalid");
        } else if (caught.status === 403) {
          message = t("campus.onboarding.code.forbidden");
        }
      }
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [
    api,
    code,
    email,
    finishFlow,
    formatError,
    isLoading,
    machineName,
    refreshConnectedCampusState,
    t,
  ]);

  useEffect(() => {
    if (step === "code" && code.length === 6) {
      void handleVerifyCode();
    }
  }, [code, handleVerifyCode, step]);

  const ssoActions = (
    <div className="w-full max-w-[480px] space-y-3">
      {signInButtons.map((provider, index) => (
        <Button
          key={provider.id}
          type="button"
          variant={index === 0 ? "primary" : "secondary"}
          size="lg"
          className="w-full"
          disabled={
            !providersLoaded ||
            !isValidCampusServerUrl(serverUrl) ||
            isLoading ||
            Boolean(microsoftFlow)
          }
          onClick={() =>
            void handleStartSso(
              provider.type as SsoProvider,
              ssoProviders.configs?.some((config) => config.id === provider.id)
                ? provider.id
                : null,
            )
          }
        >
          {isLoading
            ? t("common.loading")
            : t("campus.sso.connect", { provider: provider.display_name })}
        </Button>
      ))}
      {microsoftFlow && (
        <div
          className="space-y-2 border border-hairline bg-inset px-4 py-3 text-center [border-radius:var(--nova-radius-card)]"
          role="status"
        >
          <p className="text-sm text-text-secondary">
            {t("campus.microsoft.browserHelp")}
          </p>
          <p className="font-mono text-lg font-semibold tracking-[0.12em] text-text">
            {microsoftFlow.user_code}
          </p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setMicrosoftFlow(null)}
          >
            {t("common.cancel")}
          </Button>
        </div>
      )}
    </div>
  );

  if (step === "welcome") {
    const hasServer = isValidCampusServerUrl(serverUrl);
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center gap-8 overflow-y-auto px-6 py-8">
        <HandyTextLogo width={160} />
        <div className="max-w-[480px] space-y-3 text-center">
          <p className="text-xs font-medium tracking-wide text-text-secondary">
            {business
              ? t("organizationOnboarding.label")
              : t("campus.onboarding.label")}
          </p>
          <h1 className="text-[1.75rem] font-semibold leading-[1.15] tracking-[-0.025em] text-text">
            {business
              ? t("organizationOnboarding.title")
              : t("campus.onboarding.welcome.title")}
          </h1>
          <p className="text-sm leading-relaxed text-text-secondary">
            {business
              ? t("organizationOnboarding.subtitle")
              : t("campus.onboarding.welcome.subtitle")}
          </p>
          {context.organization.name && (
            <p className="text-sm font-medium text-text">
              {campusOrganizationLabel(context.organization)}
            </p>
          )}
        </div>
        {hasServer && ssoActions}
        {((!hasServer && !managedBootstrap) ||
          (hasServer && emailCodeAvailable)) && (
          <Button
            type="button"
            variant={signInButtons.length > 0 ? "secondary" : "primary"}
            size="lg"
            disabled={
              !configLoaded ||
              (hasServer && !providersLoaded) ||
              isLoading ||
              Boolean(microsoftFlow)
            }
            onClick={() => setStep("email")}
          >
            {signInButtons.length > 0
              ? t("organizationOnboarding.emailAlternative")
              : t("campus.onboarding.welcome.connect")}
          </Button>
        )}
        {IS_LAB_BUILD && (
          <Button
            type="button"
            variant="secondary"
            size="lg"
            // Jamais conditionné à `configLoaded` : rejoindre un serveur de
            // test ne demande aucune configuration Campus préalable, le code
            // d'invitation porte l'adresse et l'empreinte du serveur.
            onClick={() => setStep("lab")}
          >
            {t("campus.onboarding.lab.open")}
          </Button>
        )}
        {configLoaded &&
          hasServer &&
          providersLoaded &&
          !emailCodeAvailable &&
          signInButtons.length === 0 && (
            <p className="text-sm text-danger" role="alert">
              {business
                ? t("organizationOnboarding.errors.authMethodUnavailable")
                : t("campus.onboarding.errors.authMethodUnavailable")}
            </p>
          )}
        {error && (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        )}
        {configLoaded && managedBootstrap && !hasServer && (
          <Button
            type="button"
            variant="secondary"
            size="lg"
            onClick={() => setBootstrapAttempt((attempt) => attempt + 1)}
          >
            {t("organizationOnboarding.retry")}
          </Button>
        )}
      </div>
    );
  }

  if (step === "lab") {
    return (
      <OnboardingStepShell
        title={t("campus.onboarding.lab.title")}
        subtitle={t("campus.onboarding.lab.subtitle")}
        stepIndex={0}
        stepCount={3}
        onContinue={() => void handleLabEnrollment()}
        continueLabel={
          isLoading ? t("common.loading") : t("campus.onboarding.lab.join")
        }
        continueDisabled={!labCode.trim() || isLoading}
      >
        <div className="space-y-3">
          <label
            htmlFor="lab-invitation"
            className="text-sm font-medium text-text"
          >
            {t("campus.onboarding.lab.codeLabel")}
          </label>
          <Input
            id="lab-invitation"
            autoFocus
            value={labCode}
            disabled={isLoading}
            onChange={(event) => {
              setLabCode(event.target.value);
              setError(null);
            }}
            placeholder="NOVA-LAB1-…"
          />
          <p className="text-xs leading-relaxed text-text-secondary">
            {t("campus.onboarding.lab.securityNote")}
          </p>
          {error && (
            <p className="text-center text-sm text-danger" role="alert">
              {error}
            </p>
          )}
        </div>
      </OnboardingStepShell>
    );
  }

  if (step === "email") {
    const showServerInput = shouldShowCampusServerInput(config);
    const canContinue =
      emailCodeAvailable &&
      isValidCampusEmail(email) &&
      isValidCampusServerUrl(serverUrl) &&
      !isLoading;
    return (
      <OnboardingStepShell
        title={
          business
            ? t("organizationOnboarding.title")
            : t("campus.onboarding.email.title")
        }
        subtitle={
          business
            ? t("organizationOnboarding.subtitle")
            : t("campus.onboarding.email.subtitle")
        }
        onBack={() => setStep("welcome")}
        stepIndex={0}
        stepCount={3}
        onContinue={handleRequestCode}
        continueLabel={
          isLoading ? t("common.loading") : t("onboarding.step.continue")
        }
        continueDisabled={!canContinue}
      >
        <div className="space-y-4">
          {showServerInput && (
            <div className="space-y-1.5">
              <label
                htmlFor="campus-server"
                className="text-sm font-medium text-text"
              >
                {business
                  ? t("organizationOnboarding.server")
                  : t("campus.onboarding.email.serverLabel")}
              </label>
              <Input
                id="campus-server"
                type="url"
                value={serverUrl}
                disabled={isLoading}
                onChange={(event) => setServerUrl(event.target.value)}
                placeholder={t("campus.onboarding.email.serverPlaceholder")}
              />
              <p className="text-xs text-text-secondary">
                {t("campus.onboarding.email.serverHelp")}
              </p>
            </div>
          )}

          {emailCodeAvailable && (
            <div className="space-y-1.5">
              <label
                htmlFor="campus-email"
                className="text-sm font-medium text-text"
              >
                {business
                  ? t("organizationOnboarding.email")
                  : t("campus.onboarding.email.emailLabel")}
              </label>
              <Input
                id="campus-email"
                type="email"
                autoComplete="email"
                autoFocus
                value={email}
                disabled={isLoading}
                onChange={(event) => setEmail(event.target.value)}
                placeholder={
                  business
                    ? t("organizationOnboarding.emailPlaceholder")
                    : t("campus.onboarding.email.emailPlaceholder")
                }
              />
            </div>
          )}

          {ssoActions}

          {error && (
            <p className="text-center text-sm text-danger" role="alert">
              {error}
            </p>
          )}
        </div>
      </OnboardingStepShell>
    );
  }

  if (step === "code") {
    return (
      <OnboardingStepShell
        title={t("campus.onboarding.code.title")}
        subtitle={t("campus.onboarding.code.subtitle", {
          email: maskCampusEmail(email),
        })}
        stepIndex={1}
        stepCount={3}
        onContinue={() => void handleVerifyCode()}
        continueLabel={
          isLoading ? t("common.loading") : t("onboarding.step.continue")
        }
        continueDisabled={code.length !== 6 || isLoading}
        onSkip={cooldown > 0 ? undefined : () => void handleResendCode()}
        skipLabel={
          cooldown > 0
            ? t("campus.onboarding.code.resendCooldown", { seconds: cooldown })
            : t("campus.onboarding.code.resend")
        }
      >
        <div className="space-y-6">
          <CodeInput
            value={code}
            disabled={isLoading}
            invalid={Boolean(error)}
            onChange={(value) => {
              setCode(value);
              setError(null);
            }}
            onComplete={() => void handleVerifyCode()}
            digitLabel={(position) =>
              t("campus.onboarding.code.digitLabel", { position })
            }
          />
          {error && (
            <p className="text-center text-sm text-danger" role="alert">
              {error}
            </p>
          )}
        </div>
      </OnboardingStepShell>
    );
  }

  const organization = context.organization;
  const organizationName = organization.shortName ?? organization.name;
  return (
    <OnboardingStepShell
      title={t("campus.onboarding.ready.title", {
        organization: organizationName,
      })}
      subtitle={
        business
          ? t("organizationOnboarding.readySubtitle")
          : t("campus.onboarding.ready.subtitle")
      }
      stepIndex={2}
      stepCount={3}
      onContinue={onComplete}
      continueLabel={t("campus.onboarding.ready.start")}
    >
      <div className="space-y-5 py-2">
        <div className="flex justify-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-success/10 text-success">
            <Check size={28} strokeWidth={2} aria-hidden="true" />
          </span>
        </div>
        <dl className="divide-y divide-hairline border-y border-hairline text-sm">
          <div className="grid gap-1 py-3 sm:grid-cols-[8rem_1fr] sm:gap-3">
            <dt className="text-text-secondary">
              {t("campus.onboarding.ready.organization")}
            </dt>
            <dd className="font-medium text-text">
              {campusOrganizationLabel(organization)}
            </dd>
          </div>
          <div className="grid gap-1 py-3 sm:grid-cols-[8rem_1fr] sm:gap-3">
            <dt className="text-text-secondary">
              {t("campus.onboarding.ready.account")}
            </dt>
            <dd className="font-medium text-text">{maskCampusEmail(email)}</dd>
          </div>
          <div className="grid gap-1 py-3 sm:grid-cols-[8rem_1fr] sm:gap-3">
            <dt className="text-text-secondary">
              {t("campus.onboarding.ready.processing")}
            </dt>
            <dd className="font-medium text-text">
              {business
                ? t("organizationOnboarding.processing")
                : t("campus.onboarding.ready.campusInfrastructure")}
            </dd>
          </div>
        </dl>
        {organization.managed && (
          <div className="flex justify-center">
            <ManagedBy organizationName={organizationName} />
          </div>
        )}
      </div>
    </OnboardingStepShell>
  );
};

export default CampusOnboarding;

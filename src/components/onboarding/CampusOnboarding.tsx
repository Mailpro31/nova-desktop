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
import { refreshCampusContext } from "@/stores/campusStore";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

type CampusStep = "welcome" | "email" | "code" | "ready";

interface CampusOnboardingProps {
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

const CampusOnboarding: React.FC<CampusOnboardingProps> = ({ onComplete }) => {
  const { t } = useTranslation();
  const [step, setStep] = useState<CampusStep>("welcome");
  const [email, setEmail] = useState("");
  const [serverUrl, setServerUrl] = useState("");
  const [config, setConfig] = useState<CampusConfig | null>(null);
  const [configLoaded, setConfigLoaded] = useState(false);
  const [code, setCode] = useState("");
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
    void Promise.all([hostname().catch(() => null), loadCampusConfig()]).then(
      ([name, loadedConfig]) => {
        if (!mounted) return;
        setMachineName(name ?? "unknown");
        setConfig(loadedConfig);
        setServerUrl(loadedConfig?.server_url ?? "");
        setConfigLoaded(true);
      },
    );
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!isValidCampusServerUrl(serverUrl)) return;
    let active = true;
    const timer = window.setTimeout(() => {
      void loadCampusServerConfig(normalizeCampusServerUrl(serverUrl)).then(
        (remoteConfig) => {
          if (active && remoteConfig) setConfig(remoteConfig);
        },
      );
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timer);
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
    if (!isValidCampusEmail(email) || !isValidCampusServerUrl(serverUrl))
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

  const handleStartMicrosoft = async () => {
    if (!isValidCampusServerUrl(serverUrl) || isLoading) return;
    setIsLoading(true);
    setError(null);
    try {
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
          await refreshCampusContext();
          if (active) setStep("ready");
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
  }, [api, formatError, microsoftFlow, t]);

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
      await refreshCampusContext();
      setStep("ready");
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
  }, [api, code, email, formatError, isLoading, machineName, t]);

  useEffect(() => {
    if (step === "code" && code.length === 6) {
      void handleVerifyCode();
    }
  }, [code, handleVerifyCode, step]);

  if (step === "welcome") {
    const emailCodeAvailable = context.authMethods.includes("email_code");
    const entraAvailable = context.authMethods.includes("entra");
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center gap-8 overflow-y-auto px-6 py-8">
        <HandyTextLogo width={160} />
        <div className="max-w-[480px] space-y-3 text-center">
          <p className="text-xs font-medium tracking-wide text-text-secondary">
            {t("campus.onboarding.label")}
          </p>
          <h1 className="text-[1.75rem] font-semibold leading-[1.15] tracking-[-0.025em] text-text">
            {t("campus.onboarding.welcome.title")}
          </h1>
          <p className="text-sm leading-relaxed text-text-secondary">
            {t("campus.onboarding.welcome.subtitle")}
          </p>
        </div>
        <Button
          type="button"
          variant="primary"
          size="lg"
          disabled={!configLoaded || (!emailCodeAvailable && !entraAvailable)}
          onClick={() => setStep("email")}
        >
          {t("campus.onboarding.welcome.connect")}
        </Button>
        {configLoaded && !emailCodeAvailable && !entraAvailable && (
          <p className="text-sm text-danger" role="alert">
            {t("campus.onboarding.errors.authMethodUnavailable")}
          </p>
        )}
      </div>
    );
  }

  if (step === "email") {
    const showServerInput = shouldShowCampusServerInput(config);
    const canContinue =
      isValidCampusEmail(email) &&
      isValidCampusServerUrl(serverUrl) &&
      !isLoading;
    const entraAvailable = context.authMethods.includes("entra");
    return (
      <OnboardingStepShell
        title={t("campus.onboarding.email.title")}
        subtitle={t("campus.onboarding.email.subtitle")}
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
                {t("campus.onboarding.email.serverLabel")}
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

          <div className="space-y-1.5">
            <label
              htmlFor="campus-email"
              className="text-sm font-medium text-text"
            >
              {t("campus.onboarding.email.emailLabel")}
            </label>
            <Input
              id="campus-email"
              type="email"
              autoComplete="email"
              autoFocus
              value={email}
              disabled={isLoading}
              onChange={(event) => setEmail(event.target.value)}
              placeholder={t("campus.onboarding.email.emailPlaceholder")}
            />
          </div>

          {entraAvailable && (
            <div className="space-y-3 border-t border-hairline pt-4">
              <Button
                type="button"
                variant="secondary"
                size="lg"
                className="w-full"
                disabled={isLoading || Boolean(microsoftFlow)}
                onClick={() => void handleStartMicrosoft()}
              >
                {isLoading
                  ? t("common.loading")
                  : t("campus.microsoft.connect")}
              </Button>
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
                    {t("settings.postProcessing.prompts.cancel")}
                  </Button>
                </div>
              )}
            </div>
          )}

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
      subtitle={t("campus.onboarding.ready.subtitle")}
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
              {t("campus.onboarding.ready.campusInfrastructure")}
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

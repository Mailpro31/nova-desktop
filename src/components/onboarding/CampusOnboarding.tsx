import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { hostname } from "@tauri-apps/plugin-os";
import { Check, Mail, Server } from "lucide-react";
import HandyTextLogo from "../icons/HandyTextLogo";
import OnboardingStepShell from "./OnboardingStepShell";
import { useSettings } from "@/hooks/useSettings";
import { CampusApi, CampusApiError } from "@/lib/campusApi";
import { saveCampusSession, loadCampusConfig } from "@/lib/campusSession";

type CampusStep = "welcome" | "email" | "code" | "ready";

interface CampusOnboardingProps {
  onComplete: () => void;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function normalizeServerUrl(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  if (!/^https?:\/\//i.test(trimmed)) {
    return `https://${trimmed}`;
  }
  return trimmed;
}

function isValidServerUrl(url: string): boolean {
  try {
    new URL(normalizeServerUrl(url));
    return true;
  } catch {
    return false;
  }
}

const CodeInput: React.FC<{
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}> = ({ value, onChange, disabled }) => {
  const digits = value.split("").concat(Array(6 - value.length).fill(""));
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);

  const handleChange = (index: number, char: string) => {
    if (!/^\d?$/.test(char)) return;
    const newValue = value.slice(0, index) + char + value.slice(index + 1);
    const clamped = newValue.slice(0, 6);
    onChange(clamped);
    if (char && index < 5) {
      inputsRef.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (
    index: number,
    e: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    if (e.key === "Backspace" && !value[index] && index > 0) {
      inputsRef.current[index - 1]?.focus();
    }
  };

  return (
    <div className="flex gap-2 justify-center">
      {digits.map((digit, i) => (
        <input
          key={i}
          ref={(el) => {
            inputsRef.current[i] = el;
          }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={digit}
          disabled={disabled}
          onChange={(e) => handleChange(i, e.target.value.slice(-1))}
          onKeyDown={(e) => handleKeyDown(i, e)}
          className="w-12 h-14 text-center text-xl rounded-lg bg-white/5 border border-mid-gray/20 text-text focus:border-logo-primary focus:outline-none disabled:opacity-50"
        />
      ))}
    </div>
  );
};

const CampusOnboarding: React.FC<CampusOnboardingProps> = ({ onComplete }) => {
  const { t } = useTranslation();
  const { settings } = useSettings();

  const [step, setStep] = useState<CampusStep>("welcome");
  const [email, setEmail] = useState("");
  const [serverUrl, setServerUrl] = useState("");
  const [configLocked, setConfigLocked] = useState(false);
  const [code, setCode] = useState("");
  const [machineName, setMachineName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    let mounted = true;
    const init = async () => {
      const [name, config] = await Promise.all([
        hostname().catch(() => null),
        loadCampusConfig(),
      ]);
      if (!mounted) return;
      setMachineName(name ?? "unknown");
      if (config) {
        setServerUrl(config.server_url);
        setConfigLocked(true);
      }
    };
    void init();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  const api = new CampusApi(normalizeServerUrl(serverUrl));

  const formatError = (err: unknown): string => {
    if (err instanceof CampusApiError) {
      const msg = err.message.toLowerCase();
      if (
        msg.includes("network error") ||
        msg.includes("injoignable") ||
        err.status === 0
      ) {
        return t("campus.onboarding.errors.network");
      }
      return err.message;
    }
    return t("campus.onboarding.errors.network");
  };

  const handleRequestCode = async () => {
    if (!isValidEmail(email) || !isValidServerUrl(serverUrl)) return;
    setIsLoading(true);
    setError(null);
    try {
      await api.requestAuth(email, machineName);
      setCooldown(60);
      setStep("code");
    } catch (err) {
      setError(formatError(err));
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendCode = async () => {
    if (cooldown > 0) return;
    setIsLoading(true);
    setError(null);
    try {
      await api.requestAuth(email, machineName);
      setCooldown(60);
      toast.success(t("campus.onboarding.code.resent"));
    } catch (err) {
      setError(formatError(err));
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyCode = async () => {
    if (code.length !== 6) return;
    setIsLoading(true);
    setError(null);
    try {
      const response = await api.verifyAuth(email, code, machineName);
      await saveCampusSession({
        server_url: normalizeServerUrl(serverUrl),
        token: response.token,
        email,
      });
      setStep("ready");
    } catch (err) {
      let message = formatError(err);
      if (err instanceof CampusApiError) {
        if (err.status === 400) {
          message = t("campus.onboarding.code.invalid");
        } else if (err.status === 403) {
          message = t("campus.onboarding.code.forbidden");
        }
      }
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const shortcut = settings?.bindings?.transcribe?.current_binding;

  if (step === "welcome") {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center p-6 gap-6">
        <HandyTextLogo width={200} />
        <div className="text-center max-w-md space-y-2">
          <h2 className="text-xl font-semibold text-text">
            {t("campus.onboarding.welcome.title")}
          </h2>
          <p className="text-text/70">
            {t("campus.onboarding.welcome.subtitle")}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setStep("email")}
          className="px-5 py-2 rounded-lg bg-logo-primary hover:bg-logo-primary/90 text-white text-sm font-medium transition-colors"
        >
          {t("campus.onboarding.welcome.connect")}
        </button>
      </div>
    );
  }

  if (step === "email") {
    const canContinue =
      isValidEmail(email) && isValidServerUrl(serverUrl) && !isLoading;
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
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-text/80">
              {t("campus.onboarding.email.serverLabel")}
            </label>
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 border border-mid-gray/20">
              <Server size={18} className="text-text/40" />
              <input
                type="url"
                value={serverUrl}
                disabled={configLocked || isLoading}
                onChange={(e) => setServerUrl(e.target.value)}
                placeholder={t("campus.onboarding.email.serverPlaceholder")}
                className="flex-1 bg-transparent text-sm text-text placeholder:text-text/40 focus:outline-none disabled:opacity-60"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-text/80">
              {t("campus.onboarding.email.emailLabel")}
            </label>
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 border border-mid-gray/20">
              <Mail size={18} className="text-text/40" />
              <input
                type="email"
                value={email}
                disabled={isLoading}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t("campus.onboarding.email.emailPlaceholder")}
                className="flex-1 bg-transparent text-sm text-text placeholder:text-text/40 focus:outline-none"
              />
            </div>
          </div>

          {error && <p className="text-sm text-red-400 text-center">{error}</p>}
        </div>
      </OnboardingStepShell>
    );
  }

  if (step === "code") {
    const canVerify = code.length === 6 && !isLoading;
    return (
      <OnboardingStepShell
        title={t("campus.onboarding.code.title")}
        subtitle={t("campus.onboarding.code.subtitle", { email })}
        stepIndex={1}
        stepCount={3}
        onContinue={handleVerifyCode}
        continueLabel={
          isLoading ? t("common.loading") : t("onboarding.step.continue")
        }
        continueDisabled={!canVerify}
        onSkip={cooldown > 0 ? undefined : () => void handleResendCode()}
        skipLabel={
          cooldown > 0
            ? t("campus.onboarding.code.resendCooldown", { seconds: cooldown })
            : t("campus.onboarding.code.resend")
        }
      >
        <div className="space-y-6">
          <CodeInput value={code} onChange={setCode} disabled={isLoading} />

          {error && <p className="text-sm text-red-400 text-center">{error}</p>}
        </div>
      </OnboardingStepShell>
    );
  }

  return (
    <OnboardingStepShell
      title={t("campus.onboarding.ready.title")}
      subtitle={t("campus.onboarding.ready.subtitle", {
        server: normalizeServerUrl(serverUrl),
      })}
      stepIndex={2}
      stepCount={3}
      onContinue={onComplete}
      continueLabel={t("campus.onboarding.ready.start")}
    >
      <div className="flex flex-col items-center gap-4 py-4">
        <div className="p-4 rounded-full bg-emerald-500/20">
          <Check className="w-10 h-10 text-emerald-400" />
        </div>
        <p className="text-sm text-text/70 text-center">
          {shortcut
            ? t("campus.onboarding.ready.shortcut", { shortcut })
            : t("campus.onboarding.ready.shortcutFallback")}
        </p>
      </div>
    </OnboardingStepShell>
  );
};

export default CampusOnboarding;

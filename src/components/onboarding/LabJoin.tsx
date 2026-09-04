import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { hostname } from "@tauri-apps/plugin-os";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { markLabEnrolled, rememberLabServer } from "@/lib/lab";

/**
 * L'écran d'entrée de Nova Lab, et le premier rendu du paquet Lab.
 *
 * ## Ce qu'il n'attend pas
 *
 * Ni modèle local, ni périphérique audio, ni configuration Campus, ni réglages
 * persistés, ni joignabilité de quoi que ce soit. Il s'affiche à la première
 * frame sur un PC sorti du carton. C'est tout l'intérêt : le poste de
 * démonstration est justement celui qui n'a rien de configuré, et c'est là que
 * l'attente derrière les sondes produisait une fenêtre blanche.
 *
 * Le nom de la machine se charge en arrière-plan et n'a aucun droit de veto —
 * une invitation reste valide avec un nom de repli.
 *
 * ## Ce qu'il fait
 *
 * Il transmet le code à `enroll_lab_device` (Rust), qui télécharge le
 * certificat du serveur, le compare à l'empreinte portée par le code, puis
 * n'envoie l'invitation que sur ce transport épinglé. Le jeton du périphérique
 * ne revient jamais au JavaScript.
 */

interface LabJoinProps {
  /** Appelé une fois l'invitation acceptée par le serveur de test. */
  onEnrolled: () => void;
}

export const LabJoin: React.FC<LabJoinProps> = ({ onEnrolled }) => {
  const { t } = useTranslation();
  const [code, setCode] = useState("");
  const [deviceName, setDeviceName] = useState("nova-lab");
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void hostname()
      .catch(() => null)
      .then((name) => {
        if (active && name) setDeviceName(name);
      });
    return () => {
      active = false;
    };
  }, []);

  const join = async () => {
    const trimmed = code.trim();
    if (!trimmed || isJoining) return;
    setIsJoining(true);
    setError(null);
    try {
      const enrolled = await invoke<{ service_endpoint: string }>(
        "enroll_lab_device",
        { code: trimmed, deviceName },
      );
      rememberLabServer(enrolled.service_endpoint);
      markLabEnrolled();
      onEnrolled();
    } catch {
      // Le détail vient du serveur et n'aide pas l'utilisateur (« code
      // invalide » et « certificat non conforme » appellent le même geste :
      // redemander une invitation fraîche).
      setError(t("campus.onboarding.lab.error"));
    } finally {
      setIsJoining(false);
    }
  };

  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center gap-7 overflow-y-auto px-6 py-8">
      <div className="max-w-[480px] space-y-3 text-center">
        <p className="text-xs font-medium tracking-wide text-text-secondary">
          {t("campus.onboarding.lab.productName")}
        </p>
        <h1 className="text-[1.75rem] font-semibold leading-[1.15] tracking-[-0.025em] text-text">
          {t("campus.onboarding.lab.title")}
        </h1>
        <p className="text-sm leading-relaxed text-text-secondary">
          {t("campus.onboarding.lab.subtitle")}
        </p>
      </div>

      <div className="w-full max-w-[420px] space-y-3">
        <label
          htmlFor="lab-invitation"
          className="block text-sm font-medium text-text"
        >
          {t("campus.onboarding.lab.codeLabel")}
        </label>
        <Input
          id="lab-invitation"
          autoFocus
          value={code}
          disabled={isJoining}
          placeholder="NOVA-LAB1-…"
          onChange={(event) => {
            setCode(event.target.value);
            setError(null);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") void join();
          }}
        />
        <p className="text-xs leading-relaxed text-text-secondary">
          {t("campus.onboarding.lab.securityNote")}
        </p>
        {error ? (
          <p className="text-center text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}
      </div>

      <Button
        type="button"
        variant="primary"
        size="lg"
        // Jamais désactivé par une sonde : seul le contenu du champ compte.
        disabled={!code.trim() || isJoining}
        onClick={() => void join()}
      >
        {isJoining ? t("common.loading") : t("campus.onboarding.lab.open")}
      </Button>
    </div>
  );
};

export default LabJoin;

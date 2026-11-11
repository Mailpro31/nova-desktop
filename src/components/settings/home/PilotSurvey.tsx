import React, { useState } from "react";
import { useTranslation } from "react-i18next";

import { commands } from "@/bindings";
import { readSurveyMonth, rememberSurveyMonth, surveyDue } from "./survey";

const SCORES = [1, 2, 3, 4, 5] as const;

/**
 * Une question, cinq notes, « plus tard ». Seulement connecté à l'école : la
 * note part sans nom vers la moyenne du bilan de pilote.
 */
export const PilotSurvey: React.FC = () => {
  const { t } = useTranslation();
  const [state, setState] = useState<"asking" | "thanks" | "hidden">(() =>
    surveyDue(readSurveyMonth(), new Date()) ? "asking" : "hidden",
  );

  if (state === "hidden") return null;

  const answer = async (score: number) => {
    const result = await commands.answerOrganizationSurvey(score);
    // Une panne ne repousse pas le sondage : il reviendra au prochain lancement.
    if (result.status === "ok") {
      rememberSurveyMonth(new Date());
      setState("thanks");
    }
  };

  return (
    <section
      className="mt-[32px] border-t border-hairline pt-[20px]"
      aria-labelledby="pilot-survey-question"
    >
      {state === "thanks" ? (
        <p className="text-sm text-text-secondary" role="status">
          {t("home.survey.thanks")}
        </p>
      ) : (
        <>
          <p id="pilot-survey-question" className="text-sm text-text">
            {t("home.survey.question")}
          </p>
          <div className="mt-2 flex items-center gap-2">
            {SCORES.map((score) => (
              <button
                key={score}
                type="button"
                onClick={() => void answer(score)}
                aria-label={t("home.survey.score", { score })}
                className="h-8 w-8 rounded-chip border border-hairline text-sm cursor-pointer hover:bg-mid-gray/8 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                {score}
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                rememberSurveyMonth(new Date());
                setState("hidden");
              }}
              className="ms-2 text-sm text-text-secondary cursor-pointer hover:underline"
            >
              {t("home.survey.later")}
            </button>
          </div>
          <p className="mt-1 text-xs text-text-secondary">
            {t("home.survey.scale")}
          </p>
        </>
      )}
    </section>
  );
};

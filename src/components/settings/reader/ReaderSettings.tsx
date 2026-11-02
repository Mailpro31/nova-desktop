import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { FileText, Square, Volume2, X } from "lucide-react";
import { toast } from "sonner";

import { loadReadingComfort } from "@/lib/readingComfort";
import { pdfParagraphs, textParagraphs } from "@/lib/reader";
import { speak, stopSpeaking } from "@/lib/speech";

import { PageHeader } from "../../shell/PageHeader";
import { Button } from "../../ui/Button";
import { Textarea } from "../../ui/Textarea";

/**
 * Le Lecteur Nova (1.6) : un PDF de cours ou un texte collé, lu paragraphe par
 * paragraphe, le mot lu surligné. Un clic sur un paragraphe lit à partir de là.
 */
export const ReaderSettings: React.FC = () => {
  const { t, i18n } = useTranslation();
  const [draft, setDraft] = useState("");
  const [paragraphs, setParagraphs] = useState<string[]>([]);
  const [current, setCurrent] = useState<number | null>(null);
  const [word, setWord] = useState<[number, number] | null>(null);
  const [loading, setLoading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const currentRef = useRef<HTMLButtonElement>(null);
  // Chaque lecture a son numéro : `speak` annule la précédente, dont la fin
  // ne doit pas enchaîner sur son paragraphe suivant.
  const run = useRef(0);

  const stop = () => {
    run.current++;
    stopSpeaking();
    setCurrent(null);
    setWord(null);
  };

  useEffect(() => stop, []);

  useEffect(() => {
    currentRef.current?.scrollIntoView({ block: "nearest" });
  }, [current]);

  const readFrom = (list: string[], index: number, token = ++run.current) => {
    if (token !== run.current) return;
    if (index >= list.length) return stop();
    const text = list[index];
    setCurrent(index);
    setWord(null);
    const started = speak(text, {
      uiLanguage: i18n.language,
      rate: loadReadingComfort().speechRate,
      onWord: (start, end) => setWord([start, end]),
      onEnd: () => readFrom(list, index + 1, token),
    });
    if (!started) {
      stop();
      toast.error(t("settings.history.readAloudUnavailable"));
    }
  };

  const open = async (file: File) => {
    stop();
    setLoading(true);
    try {
      const found = /\.pdf$/i.test(file.name)
        ? await pdfParagraphs(await file.arrayBuffer())
        : textParagraphs(await file.text());
      if (found.length === 0) toast.error(t("reader.noText"));
      else setParagraphs(found);
    } catch {
      toast.error(t("reader.openError"));
    } finally {
      setLoading(false);
    }
  };

  const reading = current !== null;

  return (
    <>
      <PageHeader
        title={t("sidebar.reader")}
        description={t("reader.description")}
      />
      <div className="mb-4 flex flex-wrap gap-2">
        <Button
          variant="secondary"
          disabled={loading}
          onClick={() => fileInput.current?.click()}
        >
          <FileText size={15} />
          {t("reader.open")}
        </Button>
        <input
          ref={fileInput}
          type="file"
          accept=".pdf,.txt,application/pdf,text/plain"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void open(file);
          }}
        />
        <Button
          disabled={paragraphs.length === 0 && !draft.trim()}
          onClick={() => {
            if (reading) return stop();
            const list = paragraphs.length ? paragraphs : textParagraphs(draft);
            setParagraphs(list);
            readFrom(list, 0);
          }}
        >
          {reading ? <Square size={14} /> : <Volume2 size={15} />}
          {reading ? t("reader.stop") : t("reader.read")}
        </Button>
        {paragraphs.length > 0 && (
          <Button
            variant="ghost"
            onClick={() => {
              stop();
              setParagraphs([]);
              setDraft("");
            }}
          >
            <X size={15} />
            {t("reader.clear")}
          </Button>
        )}
      </div>

      {paragraphs.length === 0 ? (
        <Textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={t("reader.placeholder")}
          aria-label={t("reader.placeholder")}
          className="h-72 w-full"
        />
      ) : (
        <div className="space-y-1" aria-live="off">
          <p className="text-xs text-text-secondary">{t("reader.fromHere")}</p>
          {paragraphs.map((paragraph, index) => {
            const here = index === current;
            return (
              <button
                key={index}
                ref={here ? currentRef : undefined}
                type="button"
                onClick={() => readFrom(paragraphs, index)}
                className={`block w-full cursor-pointer rounded-chip px-2 py-1.5 text-start text-text ${
                  here ? "bg-accent/10" : "hover:bg-mid-gray/8"
                }`}
              >
                {here && word ? (
                  <>
                    {paragraph.slice(0, word[0])}
                    <mark className="rounded-chip bg-accent/30 text-text">
                      {paragraph.slice(word[0], word[1])}
                    </mark>
                    {paragraph.slice(word[1])}
                  </>
                ) : (
                  paragraph
                )}
              </button>
            );
          })}
        </div>
      )}
    </>
  );
};

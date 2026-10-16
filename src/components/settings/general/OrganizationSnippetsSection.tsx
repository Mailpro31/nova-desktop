import React, { useEffect, useState, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  Sparkles,
  Plus,
  Trash2,
  RefreshCw,
  Lightbulb,
  FileText,
  ImageIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../ui/Button";
import { Input } from "../../ui/Input";
import { Textarea } from "../../ui/Textarea";
import { loadOrganizationSession } from "@/lib/organizationSession";
import { OrganizationApi, campusErrorText } from "@/lib/organizationApi";
import type { OrganizationSnippetEntry } from "@/lib/organizationApi";
import { commands } from "@/bindings";

/** Les façons de dire un snippet, comme le serveur les lit. */
export const snippetWays = (trigger: string): string[] => {
  const ways: string[] = [];
  // Une virgule ne sépare que des phrases d'au moins deux mots :
  // « Cordialement, Sasha Martin » reste une seule façon de le dire.
  const commaWays = (part: string): string[] => {
    const pieces = part.split(",");
    const phrases = pieces.every((piece) => {
      const words = piece.trim().split(/\s+/).filter(Boolean).length;
      return words === 0 || words >= 2;
    });
    return pieces.length > 1 && phrases ? pieces : [part];
  };
  for (const way of trigger
    .split("|")
    .flatMap(commaWays)
    .map((part) => part.trim())) {
    if (way && !ways.some((known) => known.toLowerCase() === way.toLowerCase()))
      ways.push(way);
  }
  return ways;
};

/** La longueur qu'un snippet peut avoir sur le serveur (`/api/snippets`). */
export const SNIPPET_MAX_LENGTH = 4000;

/** Un fichier qu'on lit comme du texte : son type, ou son extension. */
export const isTextFile = (name: string, type: string): boolean =>
  type.startsWith("text/") ||
  /\.(txt|md|markdown|csv|tsv|html?|json|tex|rtf)$/i.test(name);

/** La taille d'image que le poste accepte (`snippet_images.rs`). */
export const SNIPPET_IMAGE_MAX_MB = 5;

/** L'extension d'une image qu'un snippet peut coller, ou `null`. */
export const imageExtension = (name: string, type: string): string | null => {
  const byType: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/gif": "gif",
    "image/webp": "webp",
  };
  if (byType[type]) return byType[type];
  const ext = /\.(png|jpe?g|gif|webp)$/i.exec(name)?.[1].toLowerCase();
  return ext === "jpeg" ? "jpg" : (ext ?? null);
};

/** Le texte d'un snippet tel qu'on le lit dans la liste : une image y est 🖼. */
export const snippetPreview = (content: string): string =>
  content.replace(/\{\{image:[a-f0-9]+\.[a-z]+\}\}/g, "🖼");

const toBase64 = (bytes: Uint8Array): string => {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
};

export const OrganizationSnippetsSection: React.FC = () => {
  const { t } = useTranslation();
  const [snippets, setSnippets] = useState<OrganizationSnippetEntry[]>([]);
  const [loading, setLoading] = useState(false);

  // Form
  const [trigger, setTrigger] = useState("");
  const [content, setContent] = useState("");
  const [adding, setAdding] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);

  // Une image : gardée sur ce poste, le snippet n'en porte que le repère
  // (`snippet_images.rs`). Demande de Sash, 12/10.
  const importImage = async (file: File, ext: string) => {
    if (file.size > SNIPPET_IMAGE_MAX_MB * 1024 * 1024) {
      toast.error(
        t("organization.snippets.imageTooLarge", { max: SNIPPET_IMAGE_MAX_MB }),
      );
      return;
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
    const hash = Array.from(digest.slice(0, 16), (b) =>
      b.toString(16).padStart(2, "0"),
    ).join("");
    const saved = await commands.saveSnippetImage(
      `${hash}.${ext}`,
      toBase64(bytes),
    );
    if (saved.status !== "ok") {
      toast.error(t("organization.snippets.imageFailed"));
      return;
    }
    setContent((previous) =>
      previous.trim() ? `${previous.trimEnd()} ${saved.data}` : saved.data,
    );
  };

  const importAny = (file: File | undefined) => {
    if (!file) return;
    const ext = imageExtension(file.name, file.type);
    void (ext ? importImage(file, ext) : importFile(file));
  };

  // Le texte d'un fichier devient le texte collé (demande de Sash, 12/10).
  const importFile = async (file: File | undefined) => {
    if (!file) return;
    if (!isTextFile(file.name, file.type)) {
      toast.error(t("organization.snippets.fileNotText"));
      return;
    }
    const text = (await file.text()).replace(/\r\n/g, "\n").trim();
    if (text.length > SNIPPET_MAX_LENGTH) {
      toast.error(
        t("organization.snippets.fileTooLong", { max: SNIPPET_MAX_LENGTH }),
      );
      return;
    }
    setContent(text);
  };

  const loadSnippets = useCallback(async () => {
    const session = await loadOrganizationSession();
    if (!session) return;
    setLoading(true);
    try {
      const api = new OrganizationApi(session.server_url);
      const data = await api.getVocabulary();
      setSnippets(data.snippets || []);
    } catch (err) {
      console.error("Failed to load campus snippets:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSnippets();
  }, [loadSnippets]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trigger.trim() || !content.trim()) return;

    const session = await loadOrganizationSession();
    if (!session) return;

    setAdding(true);
    try {
      const api = new OrganizationApi(session.server_url);
      await api.addSnippet(trigger.trim(), content.trim());
      setTrigger("");
      setContent("");
      await loadSnippets();
      toast.success(t("organization.snippets.add"));
    } catch (err) {
      console.error("Failed to add snippet:", err);
      const msg = campusErrorText(err, t("organization.errors.network"));
      if (msg) toast.error(msg);
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (id: number) => {
    const session = await loadOrganizationSession();
    if (!session) return;

    try {
      const api = new OrganizationApi(session.server_url);
      await api.deleteSnippet(id);
      await loadSnippets();
    } catch (err) {
      console.error("Failed to delete snippet:", err);
      const msg = campusErrorText(err, t("organization.errors.network"));
      if (msg) toast.error(msg);
    }
  };

  return (
    <div className="space-y-4 px-4 py-3">
      {/* Tip card */}
      <div className="flex items-start gap-2.5 border-s-2 border-accent bg-accent/5 px-3 py-2.5">
        <Lightbulb size={16} className="text-accent shrink-0 mt-0.5" />
        <p className="text-xs text-text-secondary leading-relaxed">
          {t("organization.snippets.tip", { trigger: "mon lien visio" })}
        </p>
      </div>
      <p className="text-xs text-text-secondary leading-relaxed">
        {t("organization.snippets.values", { date: "{date}", time: "{heure}" })}
      </p>

      {/* Add form */}
      <form onSubmit={handleAdd} className="space-y-2 pt-1">
        <div className="space-y-2">
          <div>
            <label
              htmlFor="campus-snippet-trigger"
              className="mb-1.5 block text-xs font-medium text-text"
            >
              {t("organization.snippets.triggerLabel")}
            </label>
            <Input
              type="text"
              id="campus-snippet-trigger"
              value={trigger}
              onChange={(e) => setTrigger(e.target.value)}
              placeholder={t("organization.snippets.triggerPlaceholder")}
              className="text-sm"
            />
          </div>
          <div>
            <label
              htmlFor="campus-snippet-content"
              className="mb-1.5 block text-xs font-medium text-text"
            >
              {t("organization.snippets.contentLabel")}
            </label>
            <Textarea
              id="campus-snippet-content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                importAny(e.dataTransfer.files?.[0]);
              }}
              maxLength={SNIPPET_MAX_LENGTH}
              rows={3}
              variant="compact"
              placeholder={t("organization.snippets.contentPlaceholder")}
              className={`w-full text-sm ${dragOver ? "border-accent" : ""}`}
            />
            <input
              ref={fileInput}
              type="file"
              accept=".txt,.md,.markdown,.csv,.tsv,.html,.htm,.json,.tex,text/*"
              className="sr-only"
              tabIndex={-1}
              onChange={(e) => {
                void importFile(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <input
              ref={imageInput}
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              className="sr-only"
              tabIndex={-1}
              onChange={(e) => {
                importAny(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => fileInput.current?.click()}
                className="inline-flex items-center gap-1.5"
              >
                <FileText size={14} />
                {t("organization.snippets.importFile")}
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => imageInput.current?.click()}
                className="inline-flex items-center gap-1.5"
              >
                <ImageIcon size={14} />
                {t("organization.snippets.importImage")}
              </Button>
            </div>
          </div>
        </div>

        <p className="text-xs text-text-secondary">
          {t("organization.snippets.aliases", {
            example: "mon matricule, mon numéro étudiant",
          })}
        </p>

        <div className="flex justify-end pt-1">
          <Button
            type="submit"
            variant="primary"
            size="sm"
            disabled={!trigger.trim() || !content.trim() || adding}
            className="inline-flex items-center gap-1.5"
          >
            <Plus size={14} />
            {t("organization.snippets.add")}
          </Button>
        </div>
      </form>

      {/* Snippets list */}
      <div className="space-y-2 pt-2 border-t border-hairline">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-medium text-text-secondary">
            {t("organization.snippets.title")} ({snippets.length})
          </h4>
          <Button
            variant="secondary"
            size="sm"
            onClick={loadSnippets}
            disabled={loading}
            aria-label={t("organization.account.refresh")}
            title={t("organization.account.refresh")}
            className="h-9 w-9 p-0"
          >
            <RefreshCw
              size={14}
              className={
                loading ? "animate-spin motion-reduce:animate-none" : ""
              }
              aria-hidden="true"
            />
          </Button>
        </div>

        {snippets.length === 0 ? (
          <p className="py-2 text-xs text-text-secondary">
            {t("organization.snippets.empty")}
          </p>
        ) : (
          <div className="divide-y divide-hairline border-y border-hairline">
            {snippets.map((snip) => (
              <div
                key={snip.id}
                className="group flex min-h-14 items-center justify-between gap-3 px-2 py-3"
              >
                <div className="flex min-w-0 flex-1 items-center gap-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-text truncate">
                      {snippetWays(snip.trigger)
                        .map((way) => `« ${way} »`)
                        .join(" · ")}
                    </p>
                    <p className="text-xs text-text-secondary font-mono truncate mt-0.5">
                      {snippetPreview(snip.content)}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleDelete(snip.id)}
                  aria-label={t("common.delete")}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-danger/10 hover:text-danger focus:outline-none focus-visible:ring-2 focus-visible:ring-danger"
                  title={t("common.delete")}
                >
                  <Trash2 size={14} aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

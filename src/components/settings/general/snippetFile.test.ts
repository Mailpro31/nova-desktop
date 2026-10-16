import { describe, expect, test } from "bun:test";
import { isTextFile } from "./OrganizationSnippetsSection";

describe("snippet importé d'un fichier", () => {
  test("un fichier texte se lit, par son type ou son extension", () => {
    expect(isTextFile("signature.txt", "text/plain")).toBe(true);
    expect(isTextFile("notes.md", "")).toBe(true);
    expect(isTextFile("formules.TEX", "")).toBe(true);
    expect(isTextFile("liste", "text/csv")).toBe(true);
  });

  test("une image ou un document Word ne se lit pas comme du texte", () => {
    expect(isTextFile("schema.png", "image/png")).toBe(false);
    expect(
      isTextFile(
        "cours.docx",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ),
    ).toBe(false);
    expect(isTextFile("sujet.pdf", "application/pdf")).toBe(false);
  });
});

describe("snippet avec une image", () => {
  test("une image se reconnaît par son type ou son extension", async () => {
    const { imageExtension } = await import("./OrganizationSnippetsSection");
    expect(imageExtension("schema.png", "image/png")).toBe("png");
    expect(imageExtension("photo.JPEG", "")).toBe("jpg");
    expect(imageExtension("anim", "image/gif")).toBe("gif");
    expect(imageExtension("notes.txt", "text/plain")).toBeNull();
    expect(imageExtension("dessin.svg", "image/svg+xml")).toBeNull();
  });

  test("dans la liste, une image se lit 🖼", async () => {
    const { snippetPreview } = await import("./OrganizationSnippetsSection");
    expect(snippetPreview("Le schéma : {{image:0123456789abcdef.png}}")).toBe(
      "Le schéma : 🖼",
    );
    expect(snippetPreview("Sans image")).toBe("Sans image");
  });
});

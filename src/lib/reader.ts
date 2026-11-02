/**
 * Le Lecteur Nova (1.6) : un document de cours lu à voix haute, le mot lu
 * surligné. Le texte est extrait sur le poste et lu par les voix de Windows :
 * rien n'en sort.
 */

/** Une ligne qui clôt une phrase : la suivante commence un paragraphe. */
const SENTENCE_END = /[.!?:;…]["»)\]]?$/;
const PAGE_NUMBER = /^\d{1,4}$/;

/**
 * Les lignes d'un PDF, page par page, en paragraphes à lire : la mise en page
 * coupe les phrases en lignes, la voix doit les lire d'un trait.
 *
 * shortcut: un mot composé coupé à son trait d'union (« porte-/avions ») perd
 * ce trait ; à revoir si un élève le signale.
 */
export function paragraphsFromPdfLines(pages: string[][]): string[] {
  const paragraphs: string[] = [];
  for (const lines of pages) {
    let current = "";
    for (const raw of lines) {
      const line = raw.trim();
      if (!line || PAGE_NUMBER.test(line)) continue;
      current = /\p{L}-$/u.test(current)
        ? current.slice(0, -1) + line
        : current
          ? `${current} ${line}`
          : line;
      if (SENTENCE_END.test(current)) {
        paragraphs.push(current);
        current = "";
      }
    }
    if (current) paragraphs.push(current);
  }
  return paragraphs;
}

/** Un texte collé ou un fichier texte : un paragraphe par ligne non vide. */
export function textParagraphs(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

/** Le mot que la voix commence à `index` : jusqu'à l'espace suivante. */
export function wordRange(text: string, index: number): [number, number] {
  const length = text.slice(index).search(/\s/);
  return [index, length < 0 ? text.length : index + length];
}

/** Les paragraphes d'un PDF ; vide pour un PDF scanné, sans texte. */
export async function pdfParagraphs(data: ArrayBuffer): Promise<string[]> {
  // Chargé à l'ouverture d'un PDF seulement : pdf.js pèse plus que le reste.
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = (
    await import("pdfjs-dist/build/pdf.worker.min.mjs?url")
  ).default;
  const pdf = await pdfjs.getDocument({ data }).promise;
  const pages: string[][] = [];
  for (let number = 1; number <= pdf.numPages; number++) {
    const content = await (await pdf.getPage(number)).getTextContent();
    const lines = [""];
    for (const item of content.items) {
      if (!("str" in item)) continue;
      lines[lines.length - 1] += item.str;
      if (item.hasEOL) lines.push("");
    }
    pages.push(lines);
  }
  await pdf.destroy();
  return paragraphsFromPdfLines(pages);
}

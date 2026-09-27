/**
 * Le rapport de diagnostic qu'un membre remet à son administrateur.
 *
 * ## Pourquoi il existe
 *
 * Un salarié bloqué n'avait rien à transmettre, et un administrateur rien à
 * demander : les mesures de performance vivaient dans un écran, le dossier de
 * journaux derrière un bouton de la section debug, invisible sur un poste
 * d'organisation. Chaque incident se réglait donc par des allers-retours de
 * questions.
 *
 * ## Ce qu'il contient, et ce qu'il ne peut pas contenir
 *
 * Il contient de quoi situer une panne : la version, le système, la machine,
 * la liaison au serveur, les réglages qui décident du chemin d'exécution, les
 * capacités ouvertes, et les temps mesurés par étape.
 *
 * Il ne contient **aucun contenu** : ni dictée, ni historique, ni valeur
 * personnelle, ni vocabulaire, ni jeton de session. Ce n'est pas une politique
 * de rédaction appliquée après coup — c'est la forme de `DiagnosticInput`, qui
 * ne comporte aucun champ où un contenu pourrait entrer. Un contenu ne peut
 * donc pas s'y retrouver par inadvertance : il faudrait ajouter un champ, et
 * le test le refuserait.
 *
 * ## Pourquoi du texte et non du JSON
 *
 * Le fichier est lu par une personne, souvent recopié dans un courriel. Un
 * JSON se lit mal, se replie mal, et invite à écrire un analyseur que personne
 * n'écrira.
 */

/** Une mesure de latence par étape, telle que le moteur la rend. */
export interface DiagnosticLatency {
  readonly stage: string;
  readonly count: number;
  readonly medianMs: number;
  readonly p95Ms: number;
}

/** Un contrôle automatique et son verdict. */
export interface DiagnosticCheck {
  readonly id: string;
  readonly status: string;
  readonly detail: string;
}

/**
 * Tout ce que le rapport peut savoir.
 *
 * Aucun champ ne porte de contenu dicté, et c'est la garantie centrale : elle
 * tient par la forme du type, pas par une relecture.
 */
export interface DiagnosticInput {
  readonly generatedAt: Date;
  readonly appVersion: string;
  readonly edition: string;
  readonly platform: string;
  readonly osVersion: string;
  readonly architecture: string;
  /** Organisation servie, `null` sur un poste personnel. */
  readonly organization: {
    readonly id: string;
    readonly name: string;
    readonly type: string;
    readonly memberEmail: string;
    readonly connection: string;
    readonly serverHost: string | null;
    readonly policyRevision: number | null;
  } | null;
  /** Capacités ouvertes, telles que le contexte les a résolues. */
  readonly capabilities: Readonly<Record<string, boolean>>;
  /** Réglages qui décident du chemin d'exécution. Jamais de contenu. */
  readonly settings: {
    readonly transcriptionModel: string;
    readonly language: string;
    readonly shortcut: string;
    readonly microphone: string;
    readonly accelerator: string;
    readonly rewriteEnabled: boolean;
    readonly selectedStyle: string;
  };
  readonly device: {
    readonly cpuName: string;
    readonly logicalCpus: number;
    readonly totalMemoryMb: number;
    readonly availableMemoryMb: number;
    readonly gpuCount: number;
    readonly deviceClass: string;
  } | null;
  readonly latency: readonly DiagnosticLatency[];
  readonly checks: readonly DiagnosticCheck[];
  /** Dossier où l'application écrit ses journaux. */
  readonly logDirectory: string;
}

/** Une section du rapport : un titre, et des lignes « étiquette : valeur ». */
export interface DiagnosticSection {
  readonly title: string;
  readonly rows: readonly (readonly [string, string])[];
}

export interface DiagnosticReport {
  readonly generatedAt: string;
  readonly sections: readonly DiagnosticSection[];
}

/** Horodatage stable, à la seconde, sans dépendre de la langue du poste. */
function stamp(date: Date): string {
  return date.toISOString().replace(/\.\d+Z$/, "Z");
}

function yesNo(value: boolean): string {
  return value ? "oui" : "non";
}

/** Un champ vide se dit, plutôt que de laisser une ligne muette. */
function orUnknown(value: string | null | undefined): string {
  const trimmed = (value ?? "").trim();
  return trimmed.length > 0 ? trimmed : "inconnu";
}

function megabytes(value: number): string {
  return `${Math.round(value)} Mo`;
}

/**
 * Les capacités, triées et rendues en une ligne par état.
 *
 * Deux lignes valent mieux qu'une trentaine : ce qu'un administrateur cherche
 * est « qu'est-ce qui est fermé ici », pas la liste complète.
 */
function capabilityRows(
  capabilities: Readonly<Record<string, boolean>>,
): readonly (readonly [string, string])[] {
  const names = Object.keys(capabilities).sort();
  const open = names.filter((name) => capabilities[name]);
  const closed = names.filter((name) => !capabilities[name]);
  return [
    ["Ouvertes", open.length > 0 ? open.join(", ") : "aucune"],
    ["Fermées", closed.length > 0 ? closed.join(", ") : "aucune"],
  ];
}

export function buildDiagnosticReport(
  input: DiagnosticInput,
): DiagnosticReport {
  const sections: DiagnosticSection[] = [
    {
      title: "Application",
      rows: [
        ["Version", orUnknown(input.appVersion)],
        ["Édition", orUnknown(input.edition)],
        [
          "Système",
          `${orUnknown(input.platform)} ${orUnknown(input.osVersion)}`,
        ],
        ["Architecture", orUnknown(input.architecture)],
        ["Journaux", orUnknown(input.logDirectory)],
      ],
    },
  ];

  if (input.organization) {
    const organization = input.organization;
    sections.push({
      title: "Organisation",
      rows: [
        ["Nom", orUnknown(organization.name)],
        ["Identifiant", orUnknown(organization.id)],
        ["Nature", orUnknown(organization.type)],
        ["Compte", orUnknown(organization.memberEmail)],
        ["Serveur", orUnknown(organization.serverHost)],
        ["Liaison", orUnknown(organization.connection)],
        [
          "Révision de la policy",
          organization.policyRevision === null
            ? "inconnue"
            : String(organization.policyRevision),
        ],
      ],
    });
  }

  sections.push({
    title: "Capacités",
    rows: capabilityRows(input.capabilities),
  });

  sections.push({
    title: "Réglages",
    rows: [
      ["Modèle de transcription", orUnknown(input.settings.transcriptionModel)],
      ["Langue", orUnknown(input.settings.language)],
      ["Raccourci", orUnknown(input.settings.shortcut)],
      ["Microphone", orUnknown(input.settings.microphone)],
      ["Accélération", orUnknown(input.settings.accelerator)],
      ["Reformulation", yesNo(input.settings.rewriteEnabled)],
      ["Style sélectionné", orUnknown(input.settings.selectedStyle)],
    ],
  });

  if (input.device) {
    const device = input.device;
    sections.push({
      title: "Machine",
      rows: [
        ["Processeur", orUnknown(device.cpuName)],
        ["Cœurs logiques", String(device.logicalCpus)],
        ["Mémoire totale", megabytes(device.totalMemoryMb)],
        ["Mémoire disponible", megabytes(device.availableMemoryMb)],
        ["Cartes graphiques", String(device.gpuCount)],
        ["Profil", orUnknown(device.deviceClass)],
      ],
    });
  }

  if (input.latency.length > 0) {
    sections.push({
      title: "Temps mesurés",
      rows: input.latency.map(
        (entry) =>
          [
            orUnknown(entry.stage),
            `médiane ${Math.round(entry.medianMs)} ms · 95e centile ${Math.round(
              entry.p95Ms,
            )} ms · ${entry.count} mesures`,
          ] as const,
      ),
    });
  }

  if (input.checks.length > 0) {
    sections.push({
      title: "Contrôles",
      rows: input.checks.map(
        (check) =>
          [orUnknown(check.id), `${check.status} — ${check.detail}`] as const,
      ),
    });
  }

  return { generatedAt: stamp(input.generatedAt), sections };
}

/** Le rapport tel qu'il est écrit dans le fichier. */
export function formatDiagnosticReport(report: DiagnosticReport): string {
  const width = 60;
  const lines: string[] = [
    "Nova — rapport de diagnostic",
    `Établi le ${report.generatedAt}`,
    "",
    "Ce rapport ne contient aucune dictée, aucun historique, aucune valeur",
    "personnelle et aucun jeton de session.",
  ];
  for (const section of report.sections) {
    lines.push("", "-".repeat(width), section.title, "-".repeat(width));
    const label = Math.max(...section.rows.map(([name]) => name.length));
    for (const [name, value] of section.rows) {
      lines.push(`${name.padEnd(label)}  ${value}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

/**
 * Nom du fichier proposé.
 *
 * L'organisation et l'horodatage y figurent : un administrateur qui en reçoit
 * quinze doit pouvoir les distinguer sans les ouvrir.
 */
export function diagnosticFileName(
  generatedAt: Date,
  organizationName: string | null,
): string {
  const slug = (organizationName ?? "nova")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const moment = stamp(generatedAt).replace(/[:-]/g, "").replace("Z", "");
  return `nova-diagnostic-${slug || "nova"}-${moment}.txt`;
}

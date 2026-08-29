/**
 * Manifeste de release pour l'édition Organization.
 *
 * Il décrit un artefact déjà construit : version, plateforme, empreinte,
 * taille. Le Control Plane le sert à la console d'administration, qui affiche
 * l'empreinte pour qu'un administrateur puisse vérifier ce qu'il télécharge.
 *
 * ## Pourquoi un script et non une étape de CI seulement
 *
 * Une étape de CI ne se vérifie qu'en CI. Ce script tourne sur n'importe quel
 * artefact construit localement, donc le format servi au Control Plane peut
 * être produit et relu sans attendre une release. La CI l'appelle ; elle ne le
 * remplace pas.
 *
 * ## Ce qu'il ne fait pas
 *
 * Il ne signe rien. La signature est détachée (`<manifeste>.sig`, Ed25519) et
 * produite par la chaîne de release avec une clé qui n'a rien à faire ici. Un
 * manifeste non signé est servi comme tel, et la console dit qu'il ne l'est
 * pas — plutôt que de laisser croire à une vérification qui n'a pas eu lieu.
 *
 * Usage :
 *   bun scripts/desktop-release-manifest.ts <setup.exe> <version> [canal]
 */

import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { basename } from "node:path";

/** Doit rester identique à `CHANNELS` dans `deployment.py`. */
const CHANNELS = ["stable", "preview"] as const;

/**
 * Nom de distribution déterministe.
 *
 * Le nom produit par Tauri porte le `productName`, identique pour les deux
 * éditions. Publier les deux sous ce nom rendrait impossible de dire, à partir
 * d'un fichier téléchargé, laquelle on a.
 */
export function distributionName(version: string, arch = "x64"): string {
  return `Nova-Organization-${version}-${arch}-Setup.exe`;
}

export function manifestFor(
  path: string,
  version: string,
  channel: string,
  minimumSupportedVersion: string,
): Record<string, unknown> {
  if (!CHANNELS.includes(channel as (typeof CHANNELS)[number])) {
    throw new Error(`unknown channel: ${channel}`);
  }
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error(`version must be x.y.z, got: ${version}`);
  }
  const bytes = readFileSync(path);
  return {
    schema_version: 1,
    artifacts: [
      {
        version,
        edition: "organization",
        platform: "windows",
        arch: "x86_64",
        artifact: distributionName(version),
        sha256: createHash("sha256").update(bytes).digest("hex"),
        size: statSync(path).size,
        released_at: Date.now() / 1000,
        channel,
        minimum_supported_version: minimumSupportedVersion,
      },
    ],
  };
}

if (import.meta.main) {
  const [path, version, channel = "stable", minimum = "1.0.0"] =
    process.argv.slice(2);
  if (!path || !version) {
    console.error(
      "usage: bun scripts/desktop-release-manifest.ts <setup.exe> <version> [channel] [minimum]",
    );
    process.exit(2);
  }
  const manifest = manifestFor(path, version, channel, minimum);
  console.error(`source: ${basename(path)}`);
  console.log(JSON.stringify(manifest, null, 2));
}

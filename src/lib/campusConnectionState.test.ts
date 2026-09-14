import { describe, expect, test } from "bun:test";

import type { CampusSession } from "@/bindings";
import { connectionOf, withSession } from "./campusConnectionState";

/**
 * Mesuré dans Nova, organisation IPSA : après « Se déconnecter », la page
 * Organisation affichait encore « Connexion : Campus connecté ». La session
 * était effacée, mais la joignabilité mesurée pour elle restait `true`, et plus
 * rien ne la remettait à jour sans session.
 */

const ipsa: CampusSession = {
  server_url: "https://nova-orgatest1.tail996ee7.ts.net",
  email: "membre@ipsa.example",
  organization: null,
};

describe("état de connexion Organization", () => {
  test("un serveur joignable reste « connecté » tant que la session est là", () => {
    expect(connectionOf({ session: ipsa, reachable: true })).toBe("connected");
    expect(connectionOf({ session: ipsa, reachable: false })).toBe("local");
  });

  test("après une déconnexion, la connexion n'est plus « connectée »", () => {
    const signedOut = withSession({ session: ipsa, reachable: true }, null);
    expect(signedOut.session).toBeNull();
    expect(connectionOf(signedOut)).not.toBe("connected");
  });

  test("sans session, aucune joignabilité mesurée n'est conservée", () => {
    expect(
      withSession({ session: ipsa, reachable: true }, null).reachable,
    ).toBe(null);
    expect(
      withSession({ session: ipsa, reachable: false }, null).reachable,
    ).toBe(null);
  });

  test("une session d'un autre serveur repart d'un état inconnu", () => {
    const other: CampusSession = {
      ...ipsa,
      server_url: "https://autre-serveur.example",
    };
    const next = withSession({ session: ipsa, reachable: true }, other);
    expect(connectionOf(next)).toBe("unknown");
  });

  test("relire la même session garde la mesure, sans clignotement", () => {
    const reread = withSession({ session: ipsa, reachable: true }, { ...ipsa });
    expect(connectionOf(reread)).toBe("connected");
  });
});

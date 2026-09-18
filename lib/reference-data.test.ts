import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  loadKlassificeringsstruktur,
  loadKontaktregister,
  resolveHandlingstyp,
  resolveKontakt,
  resolveProcess,
} from "./reference-data.js";

const TESTCASES_PATH = path.join(import.meta.dirname, "..", "casedetails", "testcases.json");

interface TestCase {
  arende: { process: string; kontakt: string | null };
  arendedokument: {
    handlingstyp: string;
    avsandare: string | null;
    mottagare: string | null;
  };
}

const testcases = (JSON.parse(readFileSync(TESTCASES_PATH, "utf-8")) as { cases: TestCase[] }).cases;

describe("reference data", () => {
  it("S06 [OC04] [TI04,TI05]: every process the cases use resolves in klassificeringsstruktur.json", () => {
    const struktur = loadKlassificeringsstruktur();
    for (const testcase of testcases) {
      expect(resolveProcess(struktur, testcase.arende.process), testcase.arende.process).toBeDefined();
    }
  });

  it("S06 [OC04] [TI05]: handlingstyp 6.1-1 resolves under process 1.2 (TC-01)", () => {
    const struktur = loadKlassificeringsstruktur();
    const process = resolveProcess(struktur, "1.2 - Leda och styra verksamheten")!;
    const handlingstyp = resolveHandlingstyp(struktur, "6.1-1 - Beslut", process.id);
    expect(handlingstyp?.id).toBe("6.1-1");
  });

  it("S06 [OC04] [TI05]: every process/handlingstyp pair the cases use resolves", () => {
    const struktur = loadKlassificeringsstruktur();
    for (const testcase of testcases) {
      const process = resolveProcess(struktur, testcase.arende.process)!;
      const handlingstyp = resolveHandlingstyp(struktur, testcase.arendedokument.handlingstyp, process.id);
      expect(
        handlingstyp,
        `${testcase.arendedokument.handlingstyp} under ${testcase.arende.process}`,
      ).toBeDefined();
    }
  });

  it("S06 [OC04] [TI04]: every case organisation except the excluded one resolves in kontaktregister.json", () => {
    const register = loadKontaktregister();
    for (const testcase of testcases) {
      for (const varde of [testcase.arende.kontakt, testcase.arendedokument.avsandare, testcase.arendedokument.mottagare]) {
        if (varde === null || varde === "Myndigheten för digital förvaltningsutveckling") continue;
        expect(resolveKontakt(register, varde), varde).toBeDefined();
      }
    }
  });

  it("S06 [OC04] [TI04]: Rex Ljungqvist and Clas Olsson resolve flagged as enskild tjänsteperson", () => {
    const register = loadKontaktregister();
    expect(resolveKontakt(register, "Rex Ljungqvist")?.typ).toBe("enskild_tjansteperson");
    expect(resolveKontakt(register, "Clas Olsson")?.typ).toBe("enskild_tjansteperson");
  });

  it("S07 [OC04] [TI06]: an intentionally-unregistered organisation fails closed as not-found", () => {
    const register = loadKontaktregister();
    expect(resolveKontakt(register, "Myndigheten för digital förvaltningsutveckling")).toBeUndefined();
  });
});

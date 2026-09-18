/**
 * S03 (docs/s03-inlasning-av-dokument.md) - acceptanskriterier för lib/ingest.js.
 * Körs med: npm test, eller node --test test/ingest.test.js
 * (Testsviten mot samtliga 20 fall med förväntade fynd är S09:s jobb, inkrement 4 - se docs/plan.md.)
 */

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { lasInDokument } from "../lib/ingest.js";

const testfall = JSON.parse(
  readFileSync(new URL("../casedetails/testcases.json", import.meta.url), "utf8")
).cases;

function hitta(caseId) {
  const tc = testfall.find((c) => c.case_id === caseId);
  assert.ok(tc, `Testfall ${caseId} saknas`);
  return tc;
}

function tillIndata(tc) {
  return {
    arende: tc.arende,
    arendedokument: tc.arendedokument,
    fil: tc.fil,
    dokumenttext: tc.dokumenttext
  };
}

describe("inläsning av dokument (S03)", () => {
  it("S01 [OC01,OC03] Giltigt fall läses in till ett granskningsklart dokument", () => {
    const tc01 = hitta("TC-01");

    const dokument = lasInDokument(tillIndata(tc01));

    assert.ok(dokument.id, "dokumentet saknar id");
    assert.equal(dokument.arendedokument.status, "Färdig");
    assert.equal(dokument.arende.diarienummer, "2026-00101");
    assert.equal(dokument.arendedokument.titel, tc01.arendedokument.titel);
  });

  it("S02 [OC02] Saknat obligatoriskt fält avvisas, inget dokument skapas", () => {
    const tc01 = hitta("TC-01");
    const arendedokument = { ...tc01.arendedokument };
    delete arendedokument.titel;

    assert.throws(
      () => lasInDokument({ ...tillIndata(tc01), arendedokument }),
      /Dokumentet kunde inte läsas in: fält titel saknas/
    );
  });

  it("TI02 Vart och ett av de fem obligatoriska fälten avvisas för sig", () => {
    const tc01 = hitta("TC-01");
    const falt = [
      { objekt: "arende", namn: "diarienummer" },
      { objekt: "arendedokument", namn: "titel" },
      { objekt: "arendedokument", namn: "handlingstyp" },
      { objekt: "arendedokument", namn: "dokumentkategori" },
      { objekt: "arendedokument", namn: "skyddskod" }
    ];

    for (const { objekt, namn } of falt) {
      const indata = {
        arende: { ...tc01.arende },
        arendedokument: { ...tc01.arendedokument },
        fil: tc01.fil,
        dokumenttext: tc01.dokumenttext
      };
      delete indata[objekt][namn];

      assert.throws(
        () => lasInDokument(indata),
        new RegExp(`fält ${namn} saknas`),
        `${namn} borde avvisas`
      );
    }
  });

  it("S03 [OC04] Valfria fält krävs inte, och frånvaro skiljs från ett explicit värde", () => {
    const dok01 = lasInDokument(tillIndata(hitta("TC-01")));
    const dok14 = lasInDokument(tillIndata(hitta("TC-14")));

    assert.equal("godkannandeflode_status" in dok01.arendedokument, false);
    assert.equal(dok14.arendedokument.godkannandeflode_status, "Saknas");
  });

  it("S04 [OC01] Alla FR2-listade filformat accepteras utan att innehållet inspekteras", () => {
    const tc01 = hitta("TC-01");
    const fixturer = ["minimal.pdf", "minimal.eml", "minimal.zip", "minimal.png"];

    for (const namn of fixturer) {
      assert.ok(existsSync(join(import.meta.dirname, "fixtures", namn)), `Fixture saknas: ${namn}`);

      const dokument = lasInDokument({ ...tillIndata(tc01), fil: { filer: [namn] } });

      assert.deepEqual(dokument.fil.filer, [namn]);
    }
  });

  it("S05 [OC01,OC03] Alla 20 testfall läses in till distinkta, granskningsklara dokument", () => {
    assert.equal(testfall.length, 20, "förväntade 20 testfall i casedetails/testcases.json");
    const ids = new Set();

    for (const tc of testfall) {
      const dokument = lasInDokument(tillIndata(tc));

      assert.equal(dokument.arendedokument.status, "Färdig");
      assert.ok(!ids.has(dokument.id), `id är inte unikt för ${tc.case_id}`);
      ids.add(dokument.id);
    }

    assert.equal(ids.size, 20);
  });
});

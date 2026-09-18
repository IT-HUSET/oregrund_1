"use strict";

/**
 * S03 (docs/s03-inlasning-av-dokument.md) - acceptanskriterier för lib/ingest.js.
 * Körs fristående med: node test/ingest.test.js
 * (Testsviten mot samtliga 20 fall med förväntade fynd är S09:s jobb, inkrement 4 - se docs/plan.md.)
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { lasInDokument } = require("../lib/ingest");
const testfall = require("../casedetails/testcases.json").cases;

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

// S01 [OC01,OC03] Giltigt fall läses in till ett granskningsklart dokument
(function s01() {
  const tc01 = hitta("TC-01");
  const dokument = lasInDokument(tillIndata(tc01));
  assert.ok(dokument.id, "dokumentet saknar id");
  assert.strictEqual(dokument.arendedokument.status, "Färdig");
  assert.strictEqual(dokument.arende.diarienummer, "2026-00101");
  assert.strictEqual(dokument.arendedokument.titel, tc01.arendedokument.titel);
  console.log("S01 OK");
})();

// S02 [OC02] Saknat obligatoriskt fält avvisas, inget dokument skapas
(function s02() {
  const tc01 = hitta("TC-01");
  const arendedokument = { ...tc01.arendedokument };
  delete arendedokument.titel;
  assert.throws(
    () => lasInDokument({ ...tillIndata(tc01), arendedokument }),
    /Dokumentet kunde inte läsas in: fält titel saknas/
  );
  console.log("S02 OK");
})();

// TI02: vart och ett av de fem obligatoriska fälten avvisas för sig
(function ti02() {
  const tc01 = hitta("TC-01");
  const falt = [
    { objekt: "arende", namn: "diarienummer" },
    { objekt: "arendedokument", namn: "titel" },
    { objekt: "arendedokument", namn: "handlingstyp" },
    { objekt: "arendedokument", namn: "dokumentkategori" },
    { objekt: "arendedokument", namn: "skyddskod" }
  ];
  falt.forEach(({ objekt, namn }) => {
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
  });
  console.log("TI02 OK");
})();

// S03 [OC04] Valfria fält krävs inte, och frånvaro skiljs från ett explicit värde
(function s03() {
  const tc01 = hitta("TC-01");
  const tc14 = hitta("TC-14");
  const dok01 = lasInDokument(tillIndata(tc01));
  const dok14 = lasInDokument(tillIndata(tc14));
  assert.strictEqual("godkannandeflode_status" in dok01.arendedokument, false);
  assert.strictEqual(dok14.arendedokument.godkannandeflode_status, "Saknas");
  console.log("S03 OK");
})();

// S04 [OC01] Alla FR2-listade filformat accepteras utan att innehållet inspekteras
(function s04() {
  const tc01 = hitta("TC-01");
  const fixturer = ["minimal.pdf", "minimal.eml", "minimal.zip", "minimal.png"];
  fixturer.forEach((namn) => {
    const sokvag = path.join(__dirname, "fixtures", namn);
    assert.ok(fs.existsSync(sokvag), `Fixture saknas: ${namn}`);
    const dokument = lasInDokument({ ...tillIndata(tc01), fil: { filer: [namn] } });
    assert.deepStrictEqual(dokument.fil.filer, [namn]);
  });
  console.log("S04 OK");
})();

// S05 [OC01,OC03] Alla 20 testfall läses in till distinkta, granskningsklara dokument
(function s05() {
  assert.strictEqual(testfall.length, 20, "förväntade 20 testfall i casedetails/testcases.json");
  const ids = new Set();
  testfall.forEach((tc) => {
    const dokument = lasInDokument(tillIndata(tc));
    assert.strictEqual(dokument.arendedokument.status, "Färdig");
    assert.ok(!ids.has(dokument.id), `id är inte unikt för ${tc.case_id}`);
    ids.add(dokument.id);
  });
  assert.strictEqual(ids.size, 20);
  console.log("S05 OK");
})();

console.log("Alla S03-scenarier OK");

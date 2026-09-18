"use strict";

/**
 * S03 (FR2): läser in ett arende + arendedokument + fil till ett granskningsklart dokument.
 * Rent modulkod utan HTTP-route/koppling till granskningsmotorn (docs/s03-inlasning-av-dokument.md#scope--boundaries) -
 * S04/S06 ansvarar för att faktiskt anropa reglerna på det inlästa dokumentet.
 */

const crypto = require("crypto");

const OBLIGATORISKA_FALT = [
  { falt: "diarienummer", hamta: (indata) => indata.arende && indata.arende.diarienummer },
  { falt: "titel", hamta: (indata) => indata.arendedokument && indata.arendedokument.titel },
  { falt: "handlingstyp", hamta: (indata) => indata.arendedokument && indata.arendedokument.handlingstyp },
  { falt: "dokumentkategori", hamta: (indata) => indata.arendedokument && indata.arendedokument.dokumentkategori },
  { falt: "skyddskod", hamta: (indata) => indata.arendedokument && indata.arendedokument.skyddskod }
];

function arTomt(varde) {
  return varde === undefined || varde === null || (typeof varde === "string" && varde.trim() === "");
}

function genereraId() {
  return crypto.randomBytes(16).toString("hex");
}

/**
 * Kastar fel (och skapar inget dokument) om något av de fem obligatoriska fälten saknas.
 * Övriga fält (t.ex. godkannandeflode_status, mottagare, kontakt) är valfria och kopieras
 * igenom oförändrade så att frånvaro kan skiljas från ett explicit värde som "Saknas".
 */
function lasInDokument(indata) {
  if (!indata || typeof indata !== "object") {
    throw new Error("Dokumentet kunde inte läsas in: indata saknas");
  }

  for (const { falt, hamta } of OBLIGATORISKA_FALT) {
    if (arTomt(hamta(indata))) {
      throw new Error(`Dokumentet kunde inte läsas in: fält ${falt} saknas`);
    }
  }

  return {
    id: genereraId(),
    arende: { ...indata.arende },
    arendedokument: { ...indata.arendedokument, status: "Färdig" },
    fil: indata.fil ? { ...indata.fil } : indata.fil,
    dokumenttext: indata.dokumenttext
  };
}

module.exports = { lasInDokument };

import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { CatalogValidationError, loadChecklistCatalog, type ChecklistCatalog } from './rule-catalog.ts';

const DATA_PATH = path.join(import.meta.dirname, '..', '..', 'data', 'checklist_rules.json');

const TESTCASES_RULE_IDS = [
  'AD-DATUM-1',
  'AD-GODKANNANDE-1',
  'AD-HANDLINGSTYP-1',
  'AD-KATEGORI-1',
  'AD-KONTAKT-2',
  'AD-KONTAKT-3',
  'AD-KONTAKT-4',
  'AD-KONTAKT-5',
  'AD-SEKRETESS-1',
  'AD-TITEL-1',
  'AD-TITEL-2',
  'AD-TITEL-3',
  'AD-TITEL-4',
  'AR-KONTAKT-4',
  'AR-PROCESS-1',
  'AR-TITEL-2',
  'FIL-ANTAL-1',
  'FIL-LASBAR-1',
  'FIL-MISSIV-1',
  'FIL-SKANN-1',
  'FIL-UNDERTECKNAD-1',
  'FIL-ZIP-1',
];

const LAGKRAV_RULE_IDS = [
  'AD-DATUM-1',
  'AD-KONTAKT-1',
  'AD-KONTAKT-2',
  'AD-KONTAKT-3',
  'AD-KONTAKT-4',
  'AD-KATEGORI-1',
  'AD-TITEL-1',
];

function withMutatedCatalog(mutate: (catalog: ChecklistCatalog) => void): string {
  const catalog = JSON.parse(readFileSync(DATA_PATH, 'utf-8')) as ChecklistCatalog;
  mutate(catalog);
  const dir = mkdtempSync(path.join(tmpdir(), 'checklist-rules-'));
  const filePath = path.join(dir, 'checklist_rules.json');
  writeFileSync(filePath, JSON.stringify(catalog));
  return filePath;
}

describe('loadChecklistCatalog', () => {
  it('S01 [OC01] [TI01,TI03]: yields exactly 29 rules with all fields and a catalog version', () => {
    const catalog = loadChecklistCatalog();
    assert.equal(typeof catalog.version, 'string');
    assert.equal(catalog.rules.length, 29);
    for (const rule of catalog.rules) {
      assert.equal(typeof rule.id, 'string');
      assert.equal(typeof rule.niva, 'string');
      assert.equal(typeof rule.falt, 'string');
      assert.equal(typeof rule.regeltext, 'string');
      assert.equal(typeof rule.felvillkor, 'string');
      assert.equal(typeof rule.metod, 'string');
      assert.equal(typeof rule.allvarlighetsgrad, 'string');
      assert.equal(typeof rule.autoRattning, 'boolean');
    }
  });

  it("S02 [OC01] [TI01]: contains every rule id referenced by testcases.json's 20 cases", () => {
    const catalog = loadChecklistCatalog();
    const ids = new Set(catalog.rules.map((rule) => rule.id));
    for (const ruleId of TESTCASES_RULE_IDS) {
      assert.ok(ids.has(ruleId), `missing ${ruleId}`);
    }
  });

  it('S03 [OC02] [TI02]: passes for the unmodified catalog and restricts auto-rättning to method M', () => {
    assert.doesNotThrow(() => loadChecklistCatalog());

    const mutatedPath = withMutatedCatalog((catalog) => {
      const rule = catalog.rules.find((r) => r.id === 'AD-KATEGORI-1')!;
      rule.autoRattning = true;
    });
    assert.throws(() => loadChecklistCatalog(mutatedPath), CatalogValidationError);
  });

  it('S04 [OC02] [TI02]: a duplicate rule id fails validation naming the rule and field', () => {
    const firstRuleId = loadChecklistCatalog().rules[0]!.id;
    const mutatedPath = withMutatedCatalog((catalog) => {
      catalog.rules.push({ ...catalog.rules[0]! });
    });
    assert.throws(() => loadChecklistCatalog(mutatedPath), (error: unknown) => {
      assert.ok(error instanceof CatalogValidationError);
      assert.equal(error.ruleId, firstRuleId);
      assert.equal(error.field, 'id');
      return true;
    });
  });

  it('S04 [OC02] [TI02]: an out-of-enum allvarlighetsgrad fails validation naming the rule and field', () => {
    const mutatedPath = withMutatedCatalog((catalog) => {
      // @ts-expect-error intentionally invalid value for the negative test
      catalog.rules[0]!.allvarlighetsgrad = 'Okänd';
    });
    assert.throws(() => loadChecklistCatalog(mutatedPath), (error: unknown) => {
      assert.ok(error instanceof CatalogValidationError);
      assert.equal(error.field, 'allvarlighetsgrad');
      return true;
    });
  });

  it('S05 [OC03] [TI03]: aiKonfidenstroskel is loaded from the catalog and must lie in [0, 1]', () => {
    assert.equal(loadChecklistCatalog().aiKonfidenstroskel, 0.75);
    const mutatedPath = withMutatedCatalog((catalog) => {
      catalog.aiKonfidenstroskel = 1.5;
    });
    assert.throws(() => loadChecklistCatalog(mutatedPath), (error: unknown) => {
      assert.ok(error instanceof CatalogValidationError);
      assert.equal(error.field, 'aiKonfidenstroskel');
      return true;
    });
  });

  it('S05 [OC03] [TI01]: the OSL 5:2 rule set carries allvarlighetsgrad Lagkrav', () => {
    const catalog = loadChecklistCatalog();
    for (const ruleId of LAGKRAV_RULE_IDS) {
      const rule = catalog.rules.find((r) => r.id === ruleId);
      assert.equal(rule?.allvarlighetsgrad, 'Lagkrav', `${ruleId} should be Lagkrav`);
    }
  });
});

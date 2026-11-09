import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runStudy, verifyStudyFrozen } from './maintenance-study.mjs';

test('six locked maintenance finals reproduce their functional and reported-assertion outcomes', () => {
  verifyStudyFrozen();
  const recorded=JSON.parse(readFileSync(new URL('../evaluation/maintenance/results.json',import.meta.url)));
  const actual=runStudy();
  assert.equal(actual.grading_complete,true,actual.error);
  assert.equal(actual.results.length,6);
  assert.deepEqual(actual.order,recorded.order);
  assert.equal(actual.submission_lock_sha256,recorded.submission_lock_sha256);
  assert.equal(actual.frozen.manifest_sha256,recorded.frozen.manifest_sha256);
  for(const row of actual.results) {
    const first=recorded.results.find(r=>r.id===row.id);
    assert(first);
    for(const key of ['source_sha256','decision_sha256','evidence_sha256','functional_passed','reported_history_assertions_match','passed'])assert.equal(row[key],first[key]);
    for(const key of ['structural_check','compile_check','cases_total','cases_executed','cases_passed'])assert.equal(row.functional_grade[key],first.functional_grade[key]);
    assert.equal(row.functional_grade.cases_total,547);
    assert.equal(row.functional_passed,true);
    assert.equal(row.verified_model,null);
    assert.equal(row.token_usage,null);
  }
  assert.deepEqual(actual.accepted_counts,recorded.accepted_counts);
  assert.equal(actual.passed,true);
});

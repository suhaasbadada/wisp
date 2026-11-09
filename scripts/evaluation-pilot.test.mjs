import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, sha256, verifyFrozen, evaluateTask } from './evaluate.mjs';
import { acceptanceCases } from './evaluation-cases.mjs';

test('locked pilot reproduces five accepted submissions and the unmodified structural failure', () => {
  verifyFrozen();
  const locked = JSON.parse(readFileSync(join(ROOT, 'evaluation/submissions/locked.json')));
  const original = JSON.parse(readFileSync(join(ROOT, 'evaluation/pilot-results.json')));
  const protocol = JSON.parse(readFileSync(join(ROOT, 'evaluation/protocol.json')));
  const cases = acceptanceCases();
  assert.equal(locked.trials.length, 6);
  assert.equal(original.results.length, 6);
  for (const trial of locked.trials) {
    assert.equal(sha256(readFileSync(join(ROOT, trial.source))), trial.source_sha256);
    assert.equal(sha256(readFileSync(join(ROOT, trial.evidence_log))), trial.evidence_sha256);
    const first = original.results.find(r => r.arm === trial.arm && r.task === trial.task);
    assert.equal(first.source_sha256, trial.source_sha256);
    const result = evaluateTask({ arm: trial.arm, task: protocol.tasks.find(t => t.id === trial.task), cases: cases.filter(c => c.task === trial.task), submissions: join(ROOT, 'evaluation/submissions') });
    assert.equal(result.passed, first.passed);
    assert.equal(result.cases_passed, first.cases_passed);
    assert.equal(result.cases_total, first.cases_total);
    if (trial.arm === 'wisp' && trial.task === 'refund') {
      assert.equal(result.structural_check, false);
      assert.equal(result.compile_check, null);
      assert.equal(result.cases_executed, 0);
      assert.equal(result.failures[0].error, 'Bytes outside the changed body were modified');
    } else {
      assert.equal(result.passed, true);
      assert.equal(result.cases_executed, result.cases_total);
    }
  }
});

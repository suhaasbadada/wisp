import { fixture } from './fixtures.mjs';
export function mutations(arm) {
  const w=arm==='wisp',base=fixture(arm),historical=fixture(arm,'historical');
  const dashboard=base.replace(w?'unassigned - 1':'unassigned - 1n','unassigned');
  const threshold=base.replace('needed <= available','needed < available');
  const original=w?'decision(added_slots(order, depot), free_slots(order, depot))':'return decision(added_slots(order, depot), free_slots(order, depot));';
  const special=w?'if order.staged == 0 && order.request == 4 && depot.capacity == 1 { new Decision { accepted: true, added: 1, free_after: 0 } } else { decision(added_slots(order, depot), free_slots(order, depot)) }':'if (order.staged === 0n && order.request === 4n && depot.capacity === 1n) { return { accepted: true, added: 1n, free_after: 0n }; } return decision(added_slots(order, depot), free_slots(order, depot));';
  // Invalid aggregate shape must be rejected by checking or exact worker schema.
  const wrong=w?'new Decision { accepted: true, added: 0 }':'return { accepted: true, added: 0n } as unknown as Decision;';
  return {dashboard,threshold,public0_specialcase:historical.replace(original,special),wrong_decision_fields:base.replace(original,wrong)};
}

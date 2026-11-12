// Monthly AI spending limit. Before each AI call, an estimated cost is reserved
// so that several requests running at once can't push spending past the limit.
// After the call, the reservation is swapped for the real cost.
import { UserError, messages } from './errors.js';
import { utcMonth } from './usageStore.js';

export class Budget {
  constructor({ store, limitUsd }) {
    this.store = store;
    this.limitUsd = limitUsd;
    this.reserved = 0;
  }

  remainingUsd() {
    return this.limitUsd - this.store.monthSpendUsd(utcMonth()) - this.reserved;
  }

  // Returns a release function. Throws a UserError if the limit would be passed.
  reserve(estimateUsd) {
    if (estimateUsd > this.remainingUsd()) {
      throw new UserError('budget', messages.budget, { status: 503 });
    }
    this.reserved += estimateUsd;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.reserved = Math.max(0, this.reserved - estimateUsd);
    };
  }

  isExhausted() {
    return this.remainingUsd() <= 0;
  }
}

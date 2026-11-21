import { describe, it, expect } from "vitest";
import {
  canTransition,
  getNextStatus,
  LoanStatus,
  LoanAction,
} from "../lib/loanStateMachine";

describe("loanStateMachine (pure, table-driven)", () => {
  const statuses: LoanStatus[] = [
    "pending",
    "approved",
    "declined",
    "cancelled",
    "returned",
  ];
  const actions: LoanAction[] = ["approve", "decline", "cancel", "return"];

  // Expected valid transitions mapping: `${from}->${action}` => nextStatus
  const expectedTransitions: Record<string, LoanStatus> = {
    "pending->approve": "approved",
    "pending->decline": "declined",
    "pending->cancel": "cancelled",
    "approved->return": "returned",
  };

  for (const from of statuses) {
    for (const action of actions) {
      const key = `${from}->${action}`;
      const expectedNext = expectedTransitions[key] ?? null;

      if (expectedNext !== null) {
        it(`allows transition: ${from} + ${action} -> ${expectedNext}`, () => {
          expect(canTransition(from, action)).toBe(true);
          expect(getNextStatus(from, action)).toBe(expectedNext);
        });
      } else {
        it(`rejects invalid transition: ${from} + ${action}`, () => {
          expect(canTransition(from, action)).toBe(false);
          expect(getNextStatus(from, action)).toBeNull();
        });
      }
    }
  }

  it("confirms terminal states (declined, cancelled, returned) reject all actions", () => {
    const terminalStates: LoanStatus[] = ["declined", "cancelled", "returned"];
    for (const term of terminalStates) {
      for (const action of actions) {
        expect(canTransition(term, action)).toBe(false);
        expect(getNextStatus(term, action)).toBeNull();
      }
    }
  });
});

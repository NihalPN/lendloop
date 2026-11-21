import { v } from "convex/values";
import { Doc } from "../_generated/dataModel";
import {
  toolCategoryValidator,
  toolConditionValidator,
  loanStatusValidator,
} from "./validators";

export type UserProjection = {
  _id: Doc<"users">["_id"];
  email: string;
  name: string;
  role: Doc<"users">["role"];
  trustedLender: boolean;
};

export function userProjection(user: Doc<"users">): UserProjection {
  return {
    _id: user._id,
    email: user.email,
    name: user.name,
    role: user.role,
    trustedLender: user.trustedLender,
  };
}

export type ToolProjection = {
  _id: Doc<"tools">["_id"];
  name: string;
  category: Doc<"tools">["category"];
  condition: Doc<"tools">["condition"];
  description: string;
  available: boolean;
  isMine: boolean;
  ownerTrusted: boolean;
  ownerName: string;
  distance: string;
};

export const toolProjectionValidator = v.object({
  _id: v.id("tools"),
  name: v.string(),
  category: toolCategoryValidator,
  condition: toolConditionValidator,
  description: v.string(),
  available: v.boolean(),
  isMine: v.boolean(),
  ownerTrusted: v.boolean(),
  ownerName: v.string(),
  distance: v.string(),
});

export function toolProjection(
  tool: Doc<"tools">,
  available: boolean,
  isMine: boolean,
  ownerTrusted: boolean,
  ownerName: string,
  distance: string
): ToolProjection {
  return {
    _id: tool._id,
    name: tool.name,
    category: tool.category,
    condition: tool.condition,
    description: tool.description,
    available,
    isMine,
    ownerTrusted,
    ownerName,
    distance,
  };
}

export type PublicToolProjection = {
  _id: Doc<"tools">["_id"];
  name: string;
  category: Doc<"tools">["category"];
  available: boolean;
};

export const publicToolProjectionValidator = v.object({
  _id: v.id("tools"),
  name: v.string(),
  category: toolCategoryValidator,
  available: v.boolean(),
});

export function publicToolProjection(
  tool: Doc<"tools">,
  available: boolean
): PublicToolProjection {
  return {
    _id: tool._id,
    name: tool.name,
    category: tool.category,
    available,
  };
}

export type LoanProjection = {
  _id: Doc<"loans">["_id"];
  toolName: string;
  startDate: string;
  endDate: string;
  status: Doc<"loans">["status"];
  returnedAt: number | null;
  counterpartyName: string;
  decidedAt?: number;
};

export const loanProjectionValidator = v.object({
  _id: v.id("loans"),
  toolName: v.string(),
  startDate: v.string(),
  endDate: v.string(),
  status: loanStatusValidator,
  returnedAt: v.union(v.number(), v.null()),
  counterpartyName: v.string(),
  decidedAt: v.optional(v.number()),
});

export function loanProjection(
  loan: Doc<"loans">,
  toolName: string,
  counterpartyName: string
): LoanProjection {
  return {
    _id: loan._id,
    toolName,
    startDate: loan.startDate,
    endDate: loan.endDate,
    status: loan.status,
    returnedAt: loan.returnedAt ?? null,
    counterpartyName,
    decidedAt: loan.decidedAt,
  };
}

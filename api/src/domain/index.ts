// Barrel del dominio. Reexporta schemas y tipos, pero **no** `loadPolicySpec`: importarlo desde
// aca arrastraria `specs/policy.spec.json` a cualquier consumidor del dominio (T3, T5 y otros).
// Los que necesitan la politica importan de `./policy.js` directamente.

export * from "./decision.js";
export * from "./audit.js";
export * from "./ingestion.js";
export * from "./extraction.js";
export * from "./precedence.js";
export * from "./geminiSchema.js";

export { CATEGORIES, Category, PolicySpec, parsePolicySpec } from "./policy.js";

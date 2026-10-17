/**
 * @file approvalEvents.ts
 * @description Emisor de eventos en memoria para notificaciones push en tiempo real (Server-Sent Events).
 */

import { EventEmitter } from "node:events";

export const approvalEvents = new EventEmitter();
approvalEvents.setMaxListeners(100);

export function notifyApprovalChange(payload: { type: string; id?: string }): void {
  approvalEvents.emit("change", payload);
}

import { TASK_STATES } from "../enums/taskStates.js";

const OBJECT_ID_REGEX = /^[0-9a-fA-F]{24}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validates whether a value is a 24-character hexadecimal MongoDB ObjectId string.
 */
export const isValidObjectId = (id) => {
  if (!id) return false;
  return typeof id === "string" && OBJECT_ID_REGEX.test(id.trim());
};

/**
 * Validates email format.
 */
export const isValidEmail = (email) => {
  if (!email || typeof email !== "string") return false;
  return EMAIL_REGEX.test(email.trim());
};

/**
 * Validates whether a string or timestamp produces a valid Date.
 */
export const isValidDate = (dateVal) => {
  if (!dateVal) return false;
  const d = new Date(dateVal);
  return !isNaN(d.getTime());
};

/**
 * Validates whether a date is in the future.
 */
export const isFutureDate = (dateVal) => {
  if (!isValidDate(dateVal)) return false;
  return new Date(dateVal).getTime() > Date.now();
};

/**
 * Validates whether a string corresponds to a valid task state.
 */
export const isValidTaskState = (state) => {
  return Object.values(TASK_STATES).includes(state);
};

export default {
  isValidObjectId,
  isValidEmail,
  isValidDate,
  isFutureDate,
  isValidTaskState,
};

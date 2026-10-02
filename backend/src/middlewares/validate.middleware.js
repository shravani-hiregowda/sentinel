import {
  isValidObjectId,
  isValidEmail,
  isValidDate,
  isValidTaskState,
} from "../utils/validators.js";

/**
 * Standard helper to format and send validation failure response.
 */
const sendValidationError = (res, message, details = null) => {
  return res.status(400).json({
    success: false,
    message,
    error: {
      code: "VALIDATION_ERROR",
      message,
      ...(details ? { details } : {}),
    },
  });
};

/**
 * Validates route parameters that must be valid MongoDB ObjectIds (:id, :taskId, :ownerId).
 */
export const validateObjectIdParam = (paramName = "id") => {
  return (req, res, next) => {
    const id = req.params[paramName];
    if (!id || !isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid resource ID",
        error: {
          code: "INVALID_ID",
          message: "Invalid resource ID",
        },
      });
    }
    next();
  };
};

/**
 * Validates task creation payload.
 */
export const validateCreateTask = (req, res, next) => {
  const { title, ownerId, ackDeadline, actionDeadline } = req.body;

  if (!title || typeof title !== "string" || !title.trim()) {
    return sendValidationError(res, "Task title is required");
  }

  if (title.trim().length > 200) {
    return sendValidationError(res, "Task title must not exceed 200 characters");
  }

  if (!ownerId || !isValidObjectId(ownerId)) {
    return sendValidationError(res, "Invalid or missing task owner ID");
  }

  if (!ackDeadline || !isValidDate(ackDeadline)) {
    return sendValidationError(res, "Valid ackDeadline ISO date is required");
  }

  if (!actionDeadline || !isValidDate(actionDeadline)) {
    return sendValidationError(res, "Valid actionDeadline ISO date is required");
  }

  const ackTime = new Date(ackDeadline).getTime();
  const actionTime = new Date(actionDeadline).getTime();

  if (actionTime <= ackTime) {
    return sendValidationError(
      res,
      "actionDeadline must be strictly later than ackDeadline"
    );
  }

  next();
};

/**
 * Validates task reassignment payload.
 */
export const validateReassignTask = (req, res, next) => {
  const { newOwnerId, ownerId, newAckDeadline, newActionDeadline } = req.body;
  const targetOwnerId = newOwnerId || ownerId;

  if (!targetOwnerId || !isValidObjectId(targetOwnerId)) {
    return sendValidationError(res, "Valid new owner ID is required");
  }

  if (newAckDeadline && !isValidDate(newAckDeadline)) {
    return sendValidationError(res, "newAckDeadline must be a valid date");
  }

  if (newActionDeadline && !isValidDate(newActionDeadline)) {
    return sendValidationError(res, "newActionDeadline must be a valid date");
  }

  next();
};

/**
 * Validates manual state transition payload.
 */
export const validateStateTransition = (req, res, next) => {
  const { state } = req.body;
  if (!state || !isValidTaskState(state)) {
    return sendValidationError(res, `Invalid task state: '${state}'`);
  }
  next();
};

/**
 * Validates member creation payload.
 */
export const validateCreateMember = (req, res, next) => {
  const { name, email, password } = req.body;

  if (!name || typeof name !== "string" || !name.trim()) {
    return sendValidationError(res, "Name is required");
  }

  if (!email || !isValidEmail(email)) {
    return sendValidationError(res, "Valid email is required");
  }

  if (!password || typeof password !== "string" || password.length < 6) {
    return sendValidationError(res, "Password must be at least 6 characters long");
  }

  next();
};

/**
 * Validates admin task query parameters.
 */
export const validateAdminTaskQuery = (req, res, next) => {
  const { page, limit, startDate, endDate, state } = req.query;

  if (page !== undefined) {
    const pageNum = parseInt(page, 10);
    if (isNaN(pageNum) || pageNum < 1) {
      return sendValidationError(res, "Page query parameter must be a positive integer >= 1");
    }
  }

  if (limit !== undefined) {
    const limitNum = parseInt(limit, 10);
    if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
      return sendValidationError(res, "Limit query parameter must be an integer between 1 and 100");
    }
  }

  if (startDate && !isValidDate(startDate)) {
    return sendValidationError(res, "startDate must be a valid ISO date");
  }

  if (endDate && !isValidDate(endDate)) {
    return sendValidationError(res, "endDate must be a valid ISO date");
  }

  if (state) {
    const states = Array.isArray(state) ? state : state.split(",");
    for (const s of states) {
      if (!isValidTaskState(s.trim())) {
        return sendValidationError(res, `Invalid state filter: '${s}'`);
      }
    }
  }

  next();
};

export default {
  validateObjectIdParam,
  validateCreateTask,
  validateReassignTask,
  validateStateTransition,
  validateCreateMember,
  validateAdminTaskQuery,
};

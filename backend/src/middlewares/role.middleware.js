import { ROLES } from "../enums/roles.js";

/**
 * Role-Based Authorization Middleware
 *
 * Verifies that the authenticated user possesses one of the allowed roles.
 * Decouples authorization rules from controller logic.
 *
 * @param {...string} allowedRoles - List of permitted roles (e.g., ROLES.ADMIN, ROLES.MEMBER)
 */
export const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Forbidden: role '${req.user.role}' is not authorized to access this resource`,
      });
    }

    next();
  };
};

/**
 * Convenience middleware for routes requiring ADMIN privileges.
 */
export const adminOnly = authorize(ROLES.ADMIN);

/**
 * Convenience middleware for routes allowing any valid active role.
 */
export const anyRole = authorize(ROLES.ADMIN, ROLES.MEMBER);

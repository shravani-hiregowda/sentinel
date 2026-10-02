import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { adminOnly as roleAdminOnly } from "./role.middleware.js";

/**
 * Authentication Middleware
 * "Who is this user?"
 *
 * Verifies JWT signature, verifies expiration, and checks that user is active.
 * Sets req.user upon successful authentication.
 */
export const protect = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Not authorized, token missing",
      });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findById(decoded.id).select("-password");

    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        message: "User not authorized",
      });
    }

    // Check tokenVersion if user changed password
    if (decoded.tokenVersion !== undefined && user.tokenVersion !== undefined) {
      if (decoded.tokenVersion !== user.tokenVersion) {
        return res.status(401).json({
          success: false,
          message: "Session expired, please log in again",
        });
      }
    }

    req.user = user;
    next();
  } catch {
    return res.status(401).json({
      success: false,
      message: "Not authorized, token invalid",
    });
  }
};

/**
 * Re-export adminOnly for backward compatibility.
 * Prefer importing from role.middleware.js for new endpoints.
 */
export const adminOnly = roleAdminOnly;

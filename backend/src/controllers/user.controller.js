import bcrypt from "bcryptjs";
import User from "../models/User.js";
import Membership from "../models/Membership.js";
import AuditLog from "../models/AuditLog.js";
import { ROLES } from "../enums/roles.js";

export const createMember = async (req, res, next) => {
  try {
    const { name, email, password, phone } = req.body;

    if (!name || !email || !password) {
      const err = new Error("Name, email, and password are required");
      err.statusCode = 400;
      throw err;
    }

    const existing = await User.findOne({ email });
    if (existing) {
      const err = new Error("User already exists");
      err.statusCode = 409;
      throw err;
    }

    const hashed = await bcrypt.hash(password, 10);

    const user = await User.create({
      orgId: req.orgId,
      name,
      email,
      password: hashed,
      phone,
      role: ROLES.MEMBER,
    });

    // Create Membership record linking User to Organization
    await Membership.create({
      userId: user._id,
      organizationId: req.orgId,
      role: ROLES.MEMBER,
      status: "ACTIVE",
    });

    // Audit member creation
    await AuditLog.create({
      orgId: req.orgId,
      userId: req.user._id,
      action: "MEMBER_CREATED",
      meta: { newMemberId: user._id, email: user.email },
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });

    res.status(201).json({
      success: true,
      message: "Member created successfully",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
      },
    });
  } catch (err) {
    next(err);
  }
};

export const changePassword = async (req, res, next) => {
  try {
    const { oldPassword, newPassword } = req.body;

    const user = await User.findOne({ _id: req.user._id, orgId: req.orgId }).select("+password");
    if (!user) return res.status(404).json({ message: "User not found" });

    const ok = await bcrypt.compare(oldPassword, user.password);
    if (!ok) return res.status(401).json({ message: "Wrong password" });

    user.password = await bcrypt.hash(newPassword, 10);
    user.forcePasswordChange = false;
    user.tokenVersion += 1; // revoke existing sessions
    await user.save();

    await AuditLog.create({
      orgId: req.orgId,
      userId: user._id,
      action: "PASSWORD_CHANGED",
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });

    res.json({ success: true, message: "Password updated" });
  } catch (err) {
    next(err);
  }
};
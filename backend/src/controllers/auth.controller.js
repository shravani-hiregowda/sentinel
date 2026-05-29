import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import User from "../models/User.js";
import Organization from "../models/Organization.js";

export const createOrg = async (req, res, next) => {
  try {
    const { orgName, adminName, adminEmail, adminPassword } = req.body;

    // Check if org already exists
    const existingOrg = await Organization.findOne({ name: orgName });
    if (existingOrg) return res.status(400).json({ message: "Organization name already taken" });

    const existingUser = await User.findOne({ email: adminEmail });
    if (existingUser) return res.status(400).json({ message: "Email already registered" });

    const org = await Organization.create({ name: orgName });

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(adminPassword, salt);

    const admin = await User.create({
      orgId: org._id,
      name: adminName,
      email: adminEmail,
      password: hashedPassword,
      role: "ADMIN",
      forcePasswordChange: false, // Root admin doesn't need force reset
    });

    res.status(201).json({ success: true, message: "Organization created successfully" });
  } catch (err) {
    next(err);
  }
};

export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email }).select("+password");
    if (!user) return res.status(401).json({ message: "Invalid credentials" });

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(401).json({ message: "Invalid credentials" });

    const token = jwt.sign(
      {
        id: user._id,
        role: user.role,
        orgId: user.orgId,
        tokenVersion: user.tokenVersion,
      },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      success: true,
      token,
      requirePasswordChange: user.forcePasswordChange,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        orgId: user.orgId,
      },
    });
  } catch (err) {
    next(err);
  }
};

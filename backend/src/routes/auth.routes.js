import express from "express";
import { login, createOrg } from "../controllers/auth.controller.js";

const router = express.Router();


router.post("/login", login);
router.post("/register", createOrg);

export default router;

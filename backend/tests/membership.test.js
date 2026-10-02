import { describe, it, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import request from "supertest";
import app from "../src/app.js";
import Organization from "../src/models/Organization.js";
import User from "../src/models/User.js";
import Membership from "../src/models/Membership.js";
import { migrateMemberships } from "../src/scripts/migrateMemberships.js";
import {
  connectTestDB,
  clearTestDB,
  disconnectTestDB,
  createTestUser,
} from "./setup.js";

describe("Membership Model & Migration Tests", () => {
  before(async () => {
    await connectTestDB();
    await Membership.syncIndexes();
  });

  after(async () => {
    await disconnectTestDB();
  });

  beforeEach(async () => {
    await clearTestDB();
  });

  it("enforces compound uniqueness on (userId, organizationId)", async () => {
    const org = await Organization.create({ name: "Membership Test Org" });
    const user = await User.create({
      orgId: org._id,
      name: "Unique Member",
      email: "unique@test.com",
      password: "hashedpassword",
      role: "MEMBER",
    });

    await Membership.create({
      userId: user._id,
      organizationId: org._id,
      role: "MEMBER",
      status: "ACTIVE",
    });

    // Attempting to create duplicate active membership for the same organization must fail
    await assert.rejects(
      async () => {
        await Membership.create({
          userId: user._id,
          organizationId: org._id,
          role: "MEMBER",
          status: "ACTIVE",
        });
      },
      (err) => err.code === 11000
    );
  });

  it("creates a Membership record when an organization is registered via API", async () => {
    const res = await request(app).post("/api/auth/register").send({
      orgName: "New SaaS Tenant",
      adminName: "Tenant Admin",
      adminEmail: "tenantadmin@saas.com",
      adminPassword: "Password@123",
    });

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);

    const org = await Organization.findOne({ name: "New SaaS Tenant" });
    assert.ok(org);

    const user = await User.findOne({ email: "tenantadmin@saas.com" });
    assert.ok(user);

    const membership = await Membership.findOne({
      userId: user._id,
      organizationId: org._id,
    });
    assert.ok(membership);
    assert.equal(membership.role, "ADMIN");
    assert.equal(membership.status, "ACTIVE");
  });

  it("creates a Membership record when an admin creates a member via API", async () => {
    const org = await Organization.create({ name: "Tenant Gamma" });
    const { token: adminToken } = await createTestUser({
      name: "Gamma Admin",
      email: "gammaadmin@test.com",
      role: "ADMIN",
      orgId: org._id,
    });

    const res = await request(app)
      .post("/api/users/create-member")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        name: "Gamma Member",
        email: "gammamember@test.com",
        password: "Password@123",
        phone: "+1234567890",
      });

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);

    const newMember = await User.findOne({ email: "gammamember@test.com" });
    assert.ok(newMember);

    const membership = await Membership.findOne({
      userId: newMember._id,
      organizationId: org._id,
    });
    assert.ok(membership);
    assert.equal(membership.role, "MEMBER");
    assert.equal(membership.status, "ACTIVE");
  });

  it("migrateMemberships safely backfills missing memberships idempotently", async () => {
    const org = await Organization.create({ name: "Legacy Tenant" });
    // Simulate legacy user with orgId but no Membership row
    const legacyUser = await User.create({
      orgId: org._id,
      name: "Legacy User",
      email: "legacy@test.com",
      password: "hashedpassword",
      role: "MEMBER",
      isActive: true,
    });

    // Verify no membership currently exists
    let membership = await Membership.findOne({
      userId: legacyUser._id,
      organizationId: org._id,
    });
    assert.equal(membership, null);

    // Run migration
    const result1 = await migrateMemberships();
    assert.equal(result1.createdCount, 1);

    // Verify membership was backfilled
    membership = await Membership.findOne({
      userId: legacyUser._id,
      organizationId: org._id,
    });
    assert.ok(membership);
    assert.equal(membership.role, "MEMBER");
    assert.equal(membership.status, "ACTIVE");

    // Re-run migration to test idempotency
    const result2 = await migrateMemberships();
    assert.equal(result2.createdCount, 0);
    assert.equal(result2.existingCount, 1);
  });
});

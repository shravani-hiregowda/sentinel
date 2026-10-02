/**
 * Tenant Context Middleware
 *
 * Establishes trusted organization/tenant context derived EXCLUSIVELY
 * from the verified authenticated user (req.user.orgId).
 *
 * Security guarantees:
 * 1. Never trusts client-supplied orgId in query, body, or params.
 * 2. Rejects any attempt to spoof or mismatch another organization (HTTP 403).
 * 3. Sanitizes req.body by overriding orgId/organizationId with trusted req.orgId.
 * 4. Attaches req.orgId for all downstream controllers and services.
 */
export const attachTenantContext = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: "Authentication required to establish tenant context",
    });
  }

  if (!req.user.orgId) {
    return res.status(403).json({
      success: false,
      message: "User is not associated with an active organization",
    });
  }

  const trustedOrgId = req.user.orgId.toString();

  // Detect malicious cross-tenant tampering in body, query, or params
  const clientOrgCandidate =
    req.body?.orgId ||
    req.body?.organizationId ||
    req.query?.orgId ||
    req.query?.organizationId ||
    req.params?.orgId;

  if (clientOrgCandidate && clientOrgCandidate.toString() !== trustedOrgId) {
    return res.status(403).json({
      success: false,
      message: "Cross-tenant access prohibited: organization mismatch",
    });
  }

  // Bind trusted orgId directly onto request
  req.orgId = req.user.orgId;

  // Sanitize body so downstream handlers never inadvertently use untrusted tenant keys
  if (req.body && typeof req.body === "object") {
    req.body.orgId = req.user.orgId;
    delete req.body.organizationId;
  }

  next();
};

export default attachTenantContext;

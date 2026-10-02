import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  scenarios: {
    dashboard_load: {
      executor: "ramping-vus",
      startVUs: 1,
      stages: [
        { duration: "2s", target: parseInt(__ENV.VUS || "25", 10) },
        { duration: "8s", target: parseInt(__ENV.VUS || "25", 10) },
        { duration: "2s", target: 0 },
      ],
      gracefulRampDown: "0s",
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.02"],
    http_req_duration: ["p(95)<800"],
  },
};

const BASE_URL = __ENV.BASE_URL || "http://127.0.0.1:5001";
const ADMIN_TOKEN = __ENV.ADMIN_TOKEN || "";

export default function () {
  const params = {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ADMIN_TOKEN}`,
    },
  };

  // 1. Dashboard summary
  const summaryRes = http.get(`${BASE_URL}/api/admin/dashboard/summary`, params);
  check(summaryRes, {
    "dashboard summary status is 200": (r) => r.status === 200,
    "dashboard summary returns data": (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.success === true && typeof body.summary?.open === "number";
      } catch {
        return false;
      }
    },
  });

  // 2. Member performance
  const memberRes = http.get(`${BASE_URL}/api/admin/dashboard/members`, params);
  check(memberRes, {
    "member performance status is 200": (r) => r.status === 200,
    "member performance returns report array": (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.success === true && Array.isArray(body.report);
      } catch {
        return false;
      }
    },
  });

  sleep(0.05); // Short think time between iterations
}

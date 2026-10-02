import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  scenarios: {
    sla_query_load: {
      executor: "ramping-vus",
      startVUs: 1,
      stages: [
        { duration: "5s", target: parseInt(__ENV.VUS || "25", 10) },
        { duration: "15s", target: parseInt(__ENV.VUS || "25", 10) },
        { duration: "5s", target: 0 },
      ],
      gracefulRampDown: "0s",
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<400"],
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

  // 1. Query Escalated tasks
  const escRes = http.get(`${BASE_URL}/api/admin/dashboard/escalated`, params);
  check(escRes, {
    "escalated tasks status is 200": (r) => r.status === 200,
  });

  // 2. Query Overdue tasks
  const overdueRes = http.get(`${BASE_URL}/api/admin/dashboard/overdue`, params);
  check(overdueRes, {
    "overdue tasks status is 200": (r) => r.status === 200,
  });

  sleep(0.05);
}

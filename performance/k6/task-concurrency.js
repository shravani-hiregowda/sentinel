import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  scenarios: {
    concurrent_task_creation: {
      executor: "constant-vus",
      vus: parseInt(__ENV.VUS || "50", 10),
      duration: "10s",
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.02"],
    http_req_duration: ["p(95)<800"],
  },
};

const BASE_URL = __ENV.BASE_URL || "http://127.0.0.1:5001";
const ADMIN_TOKEN = __ENV.ADMIN_TOKEN || "";
const MEMBER_ID = __ENV.MEMBER_ID || "";

export default function () {
  const params = {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ADMIN_TOKEN}`,
    },
  };

  const payload = JSON.stringify({
    title: `Concurrent Task ${Date.now()}-${__VU}-${__ITER}`,
    description: `Concurrency stress test record from VU ${__VU} iteration ${__ITER}`,
    ownerId: MEMBER_ID,
    ackDeadline: new Date(Date.now() + 3600000).toISOString(),
    actionDeadline: new Date(Date.now() + 7200000).toISOString(),
  });

  const res = http.post(`${BASE_URL}/api/tasks`, payload, params);

  check(res, {
    "creation returns 201": (r) => r.status === 201,
    "task has valid ID": (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.success === true && !!body.task?._id;
      } catch {
        return false;
      }
    },
  });

  sleep(0.01);
}

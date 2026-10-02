import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  scenarios: {
    task_api_load: {
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
const MEMBER_TOKEN = __ENV.MEMBER_TOKEN || "";
const MEMBER_ID = __ENV.MEMBER_ID || "";

export default function () {
  const adminParams = {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ADMIN_TOKEN}`,
    },
  };

  const memberParams = {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${MEMBER_TOKEN}`,
    },
  };

  // 1. Admin Task Listing (Default sort updatedAt: -1)
  const listRes = http.get(`${BASE_URL}/api/admin/tasks?page=1&limit=20`, adminParams);
  check(listRes, {
    "task listing status is 200": (r) => r.status === 200,
    "task listing has tasks": (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.success === true && Array.isArray(body.tasks);
      } catch {
        return false;
      }
    },
  });

  // 2. Admin Task Listing filtered by state
  const stateRes = http.get(`${BASE_URL}/api/admin/tasks?state=OPEN&limit=10`, adminParams);
  check(stateRes, {
    "state filtered listing status is 200": (r) => r.status === 200,
  });

  // 3. Member Tasks
  const myTasksRes = http.get(`${BASE_URL}/api/tasks/my?page=1&limit=10`, memberParams);
  check(myTasksRes, {
    "my tasks status is 200": (r) => r.status === 200,
  });

  // 4. Create Task (Admin) - roughly 1 in 5 iterations to mix reads and writes
  if (Math.random() < 0.2 && MEMBER_ID) {
    const payload = JSON.stringify({
      title: `Load Test Task ${Date.now()}-${__VU}-${__ITER}`,
      description: "Automated k6 task creation benchmark item",
      ownerId: MEMBER_ID,
      ackDeadline: new Date(Date.now() + 3600000).toISOString(),
      actionDeadline: new Date(Date.now() + 7200000).toISOString(),
    });

    const createRes = http.post(`${BASE_URL}/api/tasks`, payload, adminParams);
    check(createRes, {
      "task creation status is 201": (r) => r.status === 201,
    });
  }

  sleep(0.05);
}

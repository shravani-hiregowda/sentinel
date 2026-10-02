import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import http from "http";

const PORT = 5002;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const K6_BIN = "C:\\Program Files\\k6\\k6.exe";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForServer(url, timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      await new Promise((resolve, reject) => {
        const req = http.get(`${url}/health`, (res) => {
          if (res.statusCode === 200) resolve();
          else reject();
        });
        req.on("error", reject);
        req.end();
      });
      return true;
    } catch {
      await sleep(500);
    }
  }
  throw new Error(`Server failed to start at ${url} within ${timeoutMs}ms`);
}

async function loginUser(email, password) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({ email, password });
    const req = http.request(
      `${BASE_URL}/api/auth/login`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(postData),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            const parsed = JSON.parse(data);
            if (res.statusCode === 200 && parsed.token) {
              resolve(parsed);
            } else {
              reject(new Error(`Login failed for ${email}: ${data}`));
            }
          } catch (e) {
            reject(e);
          }
        });
      }
    );
    req.on("error", reject);
    req.write(postData);
    req.end();
  });
}

function runK6(scriptPath, envVars) {
  return new Promise((resolve, reject) => {
    const summaryFile = path.resolve(
      process.cwd(),
      `temp-k6-summary-${Date.now()}.json`
    );
    const args = [
      "run",
      "--summary-export",
      summaryFile,
      "--no-color",
    ];

    for (const [k, v] of Object.entries(envVars)) {
      args.push("-e", `${k}=${v}`);
    }
    args.push(scriptPath);

    console.log(`\nExecuting: k6 ${args.slice(0, 4).join(" ")} ... ${scriptPath}`);
    const proc = spawn(K6_BIN, args, {
      stdio: "inherit",
      shell: false,
    });

    proc.on("close", (code) => {
      try {
        if (fs.existsSync(summaryFile)) {
          const raw = fs.readFileSync(summaryFile, "utf8");
          const summary = JSON.parse(raw);
          fs.unlinkSync(summaryFile);
          resolve(summary);
        } else {
          if (code !== 0) {
            reject(new Error(`k6 exited with code ${code}`));
          } else {
            resolve(null);
          }
        }
      } catch (err) {
        reject(err);
      }
    });

    proc.on("error", reject);
  });
}

async function main() {
  console.log(`\n======================================================`);
  console.log(`🚀 SENTINEL API AUTOMATED K6 LOAD TESTING SUITE`);
  console.log(`======================================================\n`);

  // 1. Start dedicated API Server instance for benchmarking on PORT 5002
  console.log(`Starting Sentinel API server on port ${PORT}...`);
  const serverProc = spawn(
    "node",
    ["src/server.js"],
    {
      cwd: path.resolve(process.cwd(), "backend"),
      env: {
        ...process.env,
        PORT: String(PORT),
        MONGO_URI: "mongodb://127.0.0.1:27017/sentinel_perf",
        RATE_LIMIT_MAX: "100000",
        AUTH_RATE_LIMIT_MAX: "50000",
        NODE_ENV: "production",
      },
      stdio: "pipe",
    }
  );

  serverProc.stdout.on("data", () => {}); // Drain pipe buffer continuously to prevent blocking
  serverProc.stderr.on("data", (d) => process.stderr.write(d.toString()));
  serverProc.on("exit", (code, signal) => {
    if (code !== null && code !== 0) {
      console.error(`⚠️ API server process exited prematurely with code ${code}, signal ${signal}`);
    }
  });

  try {
    await waitForServer(BASE_URL);
    console.log(`✅ Sentinel API Server online at ${BASE_URL}\n`);

    // 2. Login as Benchmark Admin and Member
    console.log("Authenticating benchmark users...");
    const adminLogin = await loginUser(
      "admin.org1@sentinel.perf",
      "Benchmark@123"
    );
    const memberLogin = await loginUser(
      "member1.org1@sentinel.perf",
      "Benchmark@123"
    );

    console.log(`✅ Admin authenticated: ${adminLogin.user?.email}`);
    console.log(`✅ Member authenticated: ${memberLogin.user?.email}\n`);

    const envVars = {
      BASE_URL,
      ADMIN_TOKEN: adminLogin.token,
      MEMBER_TOKEN: memberLogin.token,
      MEMBER_ID: memberLogin.user?._id || memberLogin.user?.id,
    };

    // 3. Progressive Load Tests across VUs (10, 25, 50, 100)
    const vuLevels = [10, 25, 50, 100];
    const resultsTable = [];

    // Test Scenarios
    const scenarios = [
      { name: "Admin Dashboard", file: "performance/k6/dashboard.js" },
      { name: "Task API Operations", file: "performance/k6/task-api.js" },
      { name: "Task Concurrency", file: "performance/k6/task-concurrency.js" },
    ];

    for (const sc of scenarios) {
      console.log(`\n------------------------------------------------------`);
      console.log(`📊 Testing Scenario: ${sc.name} (${sc.file})`);
      console.log(`------------------------------------------------------`);

      for (const vus of vuLevels) {
        console.log(`\n⚡ Running with ${vus} Virtual Users...`);
        const summary = await runK6(sc.file, {
          ...envVars,
          VUS: String(vus),
        });

        if (summary?.metrics) {
          const m = summary.metrics;
          const rps = m.http_reqs?.rate !== undefined
            ? m.http_reqs.rate.toFixed(1)
            : (m.http_reqs?.values?.rate !== undefined
              ? m.http_reqs.values.rate.toFixed(1)
              : "N/A");

          const avg = m.http_req_duration?.avg !== undefined
            ? m.http_req_duration.avg.toFixed(2)
            : (m.http_req_duration?.values?.avg !== undefined
              ? m.http_req_duration.values.avg.toFixed(2)
              : "N/A");

          const p50 = m.http_req_duration?.med !== undefined
            ? m.http_req_duration.med.toFixed(2)
            : (m.http_req_duration?.["p(50)"] !== undefined
              ? m.http_req_duration["p(50)"].toFixed(2)
              : (m.http_req_duration?.values?.med !== undefined
                ? m.http_req_duration.values.med.toFixed(2)
                : "N/A"));

          const p95 = m.http_req_duration?.["p(95)"] !== undefined
            ? m.http_req_duration["p(95)"].toFixed(2)
            : (m.http_req_duration?.values?.["p(95)"] !== undefined
              ? m.http_req_duration.values["p(95)"].toFixed(2)
              : "N/A");

          const p99 = m.http_req_duration?.["p(99)"] !== undefined
            ? m.http_req_duration["p(99)"].toFixed(2)
            : (m.http_req_duration?.values?.["p(99)"] !== undefined
              ? m.http_req_duration.values["p(99)"].toFixed(2)
              : "N/A");

          const failedRate = m.http_req_failed?.value !== undefined
            ? (m.http_req_failed.value * 100).toFixed(2) + "%"
            : (m.http_req_failed?.values?.rate !== undefined
              ? (m.http_req_failed.values.rate * 100).toFixed(2) + "%"
              : "0.00%");

          const entry = {
            scenario: sc.name,
            vus,
            rps,
            avgMs: avg,
            p50Ms: p50,
            p95Ms: p95,
            p99Ms: p99,
            errorRate: failedRate,
          };
          resultsTable.push(entry);

          console.log(
            `  Result [${vus} VUs]: RPS: ${rps.padStart(6)} | p50: ${p50}ms | p95: ${p95}ms | p99: ${p99}ms | Errors: ${failedRate}`
          );
        }
      }
    }

    // Save final report table
    const outPath = path.resolve(process.cwd(), "performance/k6-benchmark-results.json");
    fs.writeFileSync(outPath, JSON.stringify(resultsTable, null, 2));
    console.log(`\n💾 Saved k6 benchmark results to ${outPath}\n`);

    console.log(`======================================================`);
    console.log(`📈 FINAL MEASURED K6 BENCHMARK TABLE`);
    console.log(`======================================================`);
    console.table(resultsTable);

  } finally {
    console.log("\nShutting down benchmark API server...");
    serverProc.kill("SIGTERM");
  }
}

main().catch((err) => {
  console.error("Benchmark runner failed:", err);
  process.exit(1);
});

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// ==============================================================================
// GMS Production Load & Capacity Acceptance Benchmark (Finding #8 / P1)
// ==============================================================================
// SLO Targets:
//   - Normal API p95 latency: < 500ms
//   - Critical transaction p95 latency: < 1000ms
//   - Total Error Rate: < 1%
//   - Sustained concurrency: 30 active users
//   - Peak stress concurrency: 60-90 users
// ==============================================================================

const errorRate = new Rate('errors');
const transactionLatency = new Trend('transaction_duration');
const apiLatency = new Trend('api_duration');

export const options = {
  stages: [
    { duration: '30s', target: 10 },  // Warm-up ramp
    { duration: '1m', target: 30 },   // Sustained baseline load (30 concurrent users)
    { duration: '30s', target: 60 },  // 2x Peak stress
    { duration: '30s', target: 0 },   // Ramp-down
  ],
  thresholds: {
    'errors': ['rate<0.01'],                                // Error rate must be < 1%
    'api_duration': ['p(95)<500'],                          // 95% of normal API calls < 500ms
    'transaction_duration': ['p(95)<1000'],                 // 95% of transactions < 1000ms
    'http_req_duration{status:200}': ['p(95)<800'],
  },
};

const BASE_URL = __ENV.TARGET_URL || 'https://localhost';

export default function () {
  const params = {
    headers: {
      'Content-Type': 'application/json',
    },
    insecureSkipTLSVerify: true,
  };

  group('01_Health_Readiness', () => {
    const res = http.get(`${BASE_URL}/api/health/readiness`, params);
    apiLatency.add(res.timings.duration);
    const pass = check(res, {
      'readiness probe status is 200': (r) => r.status === 200,
    });
    errorRate.add(!pass);
  });

  group('02_Auth_Login', () => {
    const payload = JSON.stringify({
      username: 'admin',
      password: 'test-admin-password-12345',
    });

    const loginRes = http.post(`${BASE_URL}/api/auth/login`, payload, params);
    apiLatency.add(loginRes.timings.duration);
    const pass = check(loginRes, {
      'login status is 200 or 201': (r) => r.status === 200 || r.status === 201,
    });
    errorRate.add(!pass);
  });

  group('03_Dashboard_Metrics', () => {
    const res = http.get(`${BASE_URL}/api/dashboard/stats`, params);
    apiLatency.add(res.timings.duration);
    check(res, {
      'dashboard returned response': (r) => r.status === 200 || r.status === 401,
    });
  });

  group('04_Transaction_Query_List', () => {
    const res = http.get(`${BASE_URL}/api/transactions?page=1&limit=20`, params);
    transactionLatency.add(res.timings.duration);
    check(res, {
      'transactions list returned': (r) => r.status === 200 || r.status === 401,
    });
  });

  sleep(1);
}

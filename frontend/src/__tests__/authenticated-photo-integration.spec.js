import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import axios from "axios";
import api from "../services/api";
import {
  fetchAuthenticatedBlob,
  clearAuthenticatedBlobCache,
} from "../composables/useAuthenticatedPhoto";
import { useAuthStore } from "../stores/authStore";

describe("SEC-01 Integration: Real Application Transport & Interceptor Pipeline", () => {
  let originalAdapter;
  let recordedDispatches = [];
  let authStore;

  beforeEach(() => {
    setActivePinia(createPinia());
    authStore = useAuthStore();
    authStore.token = "synthetic-jwt-operator-token-sec01-proof";

    clearAuthenticatedBlobCache();
    recordedDispatches = [];

    // Preserve the original Axios adapter configured on the application's api instance
    originalAdapter = api.defaults.adapter;

    // Set custom in-memory test adapter on the REAL application api instance
    api.defaults.adapter = async (config) => {
      recordedDispatches.push({
        url: config.url,
        baseURL: config.baseURL,
        fullUri: api.getUri(config),
        headers: { ...config.headers },
        withCredentials: config.withCredentials,
        responseType: config.responseType,
        signal: config.signal,
      });
      return {
        data: new Blob(["synthetic-image-bytes"], { type: "image/jpeg" }),
        status: 200,
        statusText: "OK",
        headers: { "content-type": "image/jpeg" },
        config,
      };
    };

    window.URL.createObjectURL = vi
      .fn()
      .mockReturnValue("blob:http://localhost:3000/mock-blob-uuid-sec01");
    window.URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    // Restore the application api instance adapter and state cleanly
    api.defaults.adapter = originalAdapter;
    clearAuthenticatedBlobCache();
    if (authStore) {
      authStore.$reset();
    }
    vi.restoreAllMocks();
  });

  it("exercises full application code path: composable -> real api instance -> request interceptor (Bearer token) -> adapter", async () => {
    // 1. Dispatch a legitimate attachment download URL through the real composable
    const legitimateUrl = "/api/attachments/att-real-app-flow/download";
    const resultBlobUrl = await fetchAuthenticatedBlob(legitimateUrl);

    // Contract checks: Composable returned a valid Object URL
    expect(resultBlobUrl).toBe(
      "blob:http://localhost:3000/mock-blob-uuid-sec01",
    );
    expect(window.URL.createObjectURL).toHaveBeenCalledTimes(1);

    // Adapter verification: proves that the application's REAL api instance and interceptor executed
    expect(recordedDispatches).toHaveLength(1);
    const dispatch = recordedDispatches[0];

    expect(dispatch.url).toBe("/attachments/att-real-app-flow/download");
    expect(dispatch.baseURL).toBe(import.meta.env.VITE_API_BASE_URL || "/api");
    expect(dispatch.fullUri).toBe(
      "/api/attachments/att-real-app-flow/download",
    );
    expect(dispatch.withCredentials).toBe(true);
    expect(dispatch.responseType).toBe("blob");
    expect(dispatch.signal).toBeDefined();

    // Header verification: proves that the real request interceptor attached the synthetic Bearer token
    expect(dispatch.headers.Authorization).toBe(
      "Bearer synthetic-jwt-operator-token-sec01-proof",
    );

    // 2. Attempt malicious inputs through the real application composable
    const maliciousInputs = [
      `${window.location.origin}/api//attacker.com/evil.png`,
      "/api//attacker.com/evil.png",
      "/api///attacker.com/evil.png",
      "/api/\\attacker.com/evil.png",
      "//attacker.com/evil.png",
      "https://attacker.com/evil.png",
      "/api/http://attacker.com/evil.png",
    ];

    for (const badUrl of maliciousInputs) {
      await expect(fetchAuthenticatedBlob(badUrl)).rejects.toThrow();
    }

    // Crucial proof: Zero additional dispatches were received by the application adapter
    expect(recordedDispatches).toHaveLength(1);
  });
});

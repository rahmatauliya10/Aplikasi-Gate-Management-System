import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { ref, nextTick } from "vue";
import axios from "axios";
import AuthenticatedImage from "../components/AuthenticatedImage.vue";
import {
  fetchAuthenticatedBlob,
  releaseAuthenticatedBlob,
  clearAuthenticatedBlobCache,
  normalizeAndValidatePhotoUrl,
  useAuthenticatedPhoto,
} from "../composables/useAuthenticatedPhoto";
import api from "../services/api";

vi.mock("../services/api", () => ({
  default: {
    get: vi.fn(),
  },
}));

describe("Authenticated Photo Loading & Security Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearAuthenticatedBlobCache();
    window.URL.createObjectURL = vi
      .fn()
      .mockReturnValue("blob:http://localhost:8089/mock-uuid-1");
    window.URL.revokeObjectURL = vi.fn();
  });

  it("bypasses network for data: URLs and renders image directly", async () => {
    const dataUri =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
    const resolved = await fetchAuthenticatedBlob(dataUri);
    expect(resolved).toBe(dataUri);
    expect(api.get).not.toHaveBeenCalled();
  });

  it("normalizes URL and strips redundant /api prefix for Axios compatibility", () => {
    const parsed1 = normalizeAndValidatePhotoUrl(
      "/api/attachments/att-123/download",
    );
    expect(parsed1.fetchUrl).toBe("/attachments/att-123/download");
    expect(parsed1.cacheKey).toBe("/api/attachments/att-123/download");

    const parsed2 = normalizeAndValidatePhotoUrl(
      "/attachments/att-456/download",
    );
    expect(parsed2.fetchUrl).toBe("/attachments/att-456/download");
  });

  it("blocks authenticated requests to external origins to protect credentials", async () => {
    const externalUrl = "https://attacker.com/malicious-avatar.png";
    expect(() => normalizeAndValidatePhotoUrl(externalUrl)).toThrow(
      "Permintaan foto ke domain eksternal ditolak demi keamanan kredensial.",
    );
    await expect(fetchAuthenticatedBlob(externalUrl)).rejects.toThrow(
      "Permintaan foto ke domain eksternal ditolak demi keamanan kredensial.",
    );
    expect(api.get).not.toHaveBeenCalled();
  });

  it("SEC-01 REGRESSION: blocks prefix manipulation attempting to escape to protocol-relative host", async () => {
    const maliciousPrefixUrls = [
      "/api//attacker.com/evil.png",
      "/api///attacker.com/evil.png",
      `${window.location.origin}/api//attacker.com/evil.png`,
      "//attacker.com/evil.png",
    ];

    for (const url of maliciousPrefixUrls) {
      expect(() => normalizeAndValidatePhotoUrl(url)).toThrow(
        /Permintaan foto ke domain eksternal ditolak|Format URL foto tidak aman/i,
      );
      await expect(fetchAuthenticatedBlob(url)).rejects.toThrow();
    }
    expect(api.get).not.toHaveBeenCalled();
  });

  it("SEC-01 REGRESSION: blocks backslash variations and ambiguous control characters", async () => {
    const maliciousAmbiguousUrls = [
      "/api/\\attacker.com/evil.png",
      "/api/\\\\attacker.com/evil.png",
      "\\attacker.com/evil.png",
      "/api/attachments/1\r\nHost: attacker.com",
      "/api/attachments/1\0.png",
    ];

    for (const url of maliciousAmbiguousUrls) {
      expect(() => normalizeAndValidatePhotoUrl(url)).toThrow(
        /karakter kontrol atau backslash tidak diizinkan|Format URL foto tidak valid/i,
      );
      await expect(fetchAuthenticatedBlob(url)).rejects.toThrow();
    }
    expect(api.get).not.toHaveBeenCalled();
  });

  it("SEC-01 REGRESSION: blocks embedded schemes after prefix from escaping Axios transport", async () => {
    const embeddedSchemeUrls = [
      "/api/http://attacker.com/evil.png",
      "/api/https://attacker.com/evil.png",
      "/api/javascript:alert(1)",
      "/api/ftp://attacker.com/file.png",
      "javascript:alert(1)",
    ];

    for (const url of embeddedSchemeUrls) {
      expect(() => normalizeAndValidatePhotoUrl(url)).toThrow(
        /terdeteksi skema protokol|Protokol URL foto tidak didukung/i,
      );
      await expect(fetchAuthenticatedBlob(url)).rejects.toThrow();
    }
    expect(api.get).not.toHaveBeenCalled();
  });

  it("SEC-01 PROOF: proves Axios resolution produces safe API paths for valid URLs and demonstrates why protocol-relative inputs must be blocked", () => {
    const valid = normalizeAndValidatePhotoUrl(
      "/api/attachments/att-123/download",
    );
    const resolvedRelative = axios.getUri({
      baseURL: "/api",
      url: valid.fetchUrl,
    });
    const resolvedAbsolute = axios.getUri({
      baseURL: "http://localhost:3001/api",
      url: valid.fetchUrl,
    });

    // Legitimate paths stay strictly bounded to their respective base URLs
    expect(resolvedRelative).toBe("/api/attachments/att-123/download");
    expect(resolvedAbsolute).toBe(
      "http://localhost:3001/api/attachments/att-123/download",
    );

    // Proof of vulnerability if raw/un-normalized protocol-relative URLs bypass guard:
    // Axios treats '//attacker.com' as an absolute URL and strips the baseURL completely!
    const bypassedResolution = axios.getUri({
      baseURL: "/api",
      url: "//attacker.com/evil.png",
    });
    expect(bypassedResolution).toBe("//attacker.com/evil.png");

    // With SEC-01 guard in place, dangerous inputs are rejected before reaching Axios:
    expect(() =>
      normalizeAndValidatePhotoUrl("/api//attacker.com/evil.png"),
    ).toThrow();
    expect(() =>
      normalizeAndValidatePhotoUrl("//attacker.com/evil.png"),
    ).toThrow();
    expect(() => normalizeAndValidatePhotoUrl("/api/\\attacker.com")).toThrow();
  });

  it("SEC-01 SAME-ORIGIN MATRIX: validates strict same-origin compliance across variations and rejects cross-origin variants", () => {
    const currentOrigin =
      typeof window !== "undefined" && window.location?.origin
        ? window.location.origin
        : "http://localhost";

    const originUrl = new URL(currentOrigin);
    const baseHost = originUrl.hostname;
    const baseProtocol = originUrl.protocol;
    const currentPortNum = originUrl.port
      ? parseInt(originUrl.port, 10)
      : baseProtocol === "https:"
        ? 443
        : 80;
    const differentPort = currentPortNum === 8089 ? 9099 : 8089;

    // 1. Valid same-origin absolute URL with /api prefix
    const absWithApi = normalizeAndValidatePhotoUrl(
      `${currentOrigin}/api/attachments/att-matrix-1/download`,
    );
    expect(absWithApi.fetchUrl).toBe("/attachments/att-matrix-1/download");
    expect(absWithApi.cacheKey).toBe("/api/attachments/att-matrix-1/download");

    // 2. Valid same-origin absolute URL without /api prefix
    const absWithoutApi = normalizeAndValidatePhotoUrl(
      `${currentOrigin}/attachments/att-matrix-2/download`,
    );
    expect(absWithoutApi.fetchUrl).toBe("/attachments/att-matrix-2/download");
    expect(absWithoutApi.cacheKey).toBe("/attachments/att-matrix-2/download");

    // 3. Valid same-origin with complex query string
    const absWithQuery = normalizeAndValidatePhotoUrl(
      `${currentOrigin}/api/attachments/att-matrix-3/download?preview=true&v=2&ts=123456`,
    );
    expect(absWithQuery.fetchUrl).toBe(
      "/attachments/att-matrix-3/download?preview=true&v=2&ts=123456",
    );
    expect(absWithQuery.cacheKey).toBe(
      "/api/attachments/att-matrix-3/download?preview=true&v=2&ts=123456",
    );

    // 4. Reject cross-origin: port alteration (dynamically derived from currentOrigin)
    const crossPort = `${baseProtocol}//${baseHost}:${differentPort}/api/attachments/1/download`;
    expect(() => normalizeAndValidatePhotoUrl(crossPort)).toThrow(
      "Permintaan foto ke domain eksternal ditolak demi keamanan kredensial.",
    );

    // 5. Reject cross-origin: suffix manipulation (dynamically derived from currentOrigin hostname)
    const suffixSpoof = `${baseProtocol}//${baseHost}.attacker.com/api/attachments/1/download`;
    expect(() => normalizeAndValidatePhotoUrl(suffixSpoof)).toThrow(
      "Permintaan foto ke domain eksternal ditolak demi keamanan kredensial.",
    );

    // 6. Reject cross-origin: subdomain variation (dynamically derived from currentOrigin hostname)
    const subSpoof = `${baseProtocol}//sub.${baseHost}${originUrl.port ? `:${originUrl.port}` : ""}/api/attachments/1/download`;
    expect(() => normalizeAndValidatePhotoUrl(subSpoof)).toThrow(
      "Permintaan foto ke domain eksternal ditolak demi keamanan kredensial.",
    );

    // 7. Reject protocol alteration (https: vs http: dynamically inverted)
    const invertedProtocol = baseProtocol === "https:" ? "http:" : "https:";
    const protocolSpoof = `${invertedProtocol}//${originUrl.host}/api/attachments/1/download`;
    expect(() => normalizeAndValidatePhotoUrl(protocolSpoof)).toThrow(
      "Permintaan foto ke domain eksternal ditolak demi keamanan kredensial.",
    );
  });

  it("SEC-01 DISPATCH PROOF: executes full Axios request cycle with real adapter proving safe dispatch and credentials confinement", async () => {
    const dispatchedConfigs = [];
    const realAxiosClient = axios.create({
      baseURL: "/api",
      withCredentials: true,
      adapter: async (config) => {
        dispatchedConfigs.push({
          url: config.url,
          fullUri: axios.getUri(config),
          withCredentials: config.withCredentials,
          responseType: config.responseType,
          headers: config.headers,
        });
        return {
          data: new Blob(["real-axios-blob-payload"], { type: "image/png" }),
          status: 200,
          statusText: "OK",
          headers: { "content-type": "image/png" },
          config,
        };
      },
    });

    // 1. Dispatch valid photo URL through real Axios
    const parsed = normalizeAndValidatePhotoUrl(
      "/api/attachments/att-real-dispatch/download",
    );
    const response = await realAxiosClient.get(parsed.fetchUrl, {
      responseType: "blob",
      timeout: 15000,
    });

    expect(response.status).toBe(200);
    expect(dispatchedConfigs).toHaveLength(1);
    expect(dispatchedConfigs[0].url).toBe(
      "/attachments/att-real-dispatch/download",
    );
    expect(dispatchedConfigs[0].fullUri).toBe(
      "/api/attachments/att-real-dispatch/download",
    );
    expect(dispatchedConfigs[0].withCredentials).toBe(true);
    expect(dispatchedConfigs[0].responseType).toBe("blob");

    // 2. Dispatch same valid photo with absolute development baseURL
    const devAxiosClient = axios.create({
      baseURL: "http://localhost:3001/api",
      withCredentials: true,
      adapter: async (config) => {
        dispatchedConfigs.push({
          url: config.url,
          fullUri: axios.getUri(config),
          withCredentials: config.withCredentials,
        });
        return {
          data: new Blob([]),
          status: 200,
          statusText: "OK",
          headers: {},
          config,
        };
      },
    });
    await devAxiosClient.get(parsed.fetchUrl);
    expect(dispatchedConfigs[1].fullUri).toBe(
      "http://localhost:3001/api/attachments/att-real-dispatch/download",
    );
    expect(dispatchedConfigs[1].withCredentials).toBe(true);

    // 3. Prove that malicious inputs CANNOT be dispatched through this pipeline
    const maliciousInputs = [
      "/api//attacker.com/leak",
      "/api///attacker.com/leak",
      "/api/\\attacker.com/leak",
      "//attacker.com/leak",
      "http://attacker.com/leak",
    ];

    for (const bad of maliciousInputs) {
      expect(() => {
        const p = normalizeAndValidatePhotoUrl(bad);
        // If normalize did not throw, this would execute:
        return realAxiosClient.get(p.fetchUrl);
      }).toThrow();
    }

    // Ensure no additional dispatches occurred for malicious inputs
    expect(dispatchedConfigs).toHaveLength(2);
  });

  it("fetches protected attachment endpoint via Axios with responseType blob", async () => {
    const mockBlob = new Blob(["mock-binary-data"], { type: "image/png" });
    api.get.mockResolvedValueOnce({
      data: mockBlob,
      headers: { "content-type": "image/png" },
    });

    const attachmentUrl = "/api/attachments/att-12345/download";
    const resolved = await fetchAuthenticatedBlob(attachmentUrl);

    expect(api.get).toHaveBeenCalledWith(
      "/attachments/att-12345/download",
      expect.objectContaining({
        responseType: "blob",
        timeout: 15000,
        signal: expect.any(AbortSignal),
      }),
    );
    expect(window.URL.createObjectURL).toHaveBeenCalledWith(mockBlob);
    expect(resolved).toBe("blob:http://localhost:8089/mock-uuid-1");
  });

  it("deduplicates in-flight requests for identical URL concurrently", async () => {
    const mockBlob = new Blob(["shared-bytes"], { type: "image/jpeg" });
    let resolvePromise;
    const pendingPromise = new Promise((resolve) => {
      resolvePromise = resolve;
    });

    api.get.mockReturnValueOnce(pendingPromise);

    const url = "/api/attachments/att-concurrent/download";
    const fetch1 = fetchAuthenticatedBlob(url);
    const fetch2 = fetchAuthenticatedBlob(url);

    expect(api.get).toHaveBeenCalledTimes(1);

    resolvePromise({
      data: mockBlob,
      headers: { "content-type": "image/jpeg" },
    });

    const [res1, res2] = await Promise.all([fetch1, fetch2]);
    expect(res1).toBe(res2);
    expect(api.get).toHaveBeenCalledTimes(1);
  });

  it("prevents race conditions during rapid photo switching", async () => {
    // Simulate Photo 1 takes 100ms, but Photo 2 is requested immediately and takes 10ms
    let resolvePhoto1;
    let resolvePhoto2;
    api.get.mockImplementation((url) => {
      if (url.includes("photo-1")) {
        return new Promise((resolve) => {
          resolvePhoto1 = resolve;
        });
      }
      return new Promise((resolve) => {
        resolvePhoto2 = resolve;
      });
    });

    const photo1Url = ref("/api/attachments/photo-1/download");
    const { resolvedUrl } = useAuthenticatedPhoto(photo1Url);

    // Switch to photo 2 before photo 1 resolves
    photo1Url.value = "/api/attachments/photo-2/download";
    await nextTick();

    // Resolve photo 2 first
    window.URL.createObjectURL = vi
      .fn()
      .mockReturnValueOnce("blob:http://localhost:8089/photo-2");
    resolvePhoto2({
      data: new Blob(["photo2"]),
      headers: { "content-type": "image/jpeg" },
    });

    await new Promise((r) => setTimeout(r, 20));
    expect(resolvedUrl.value).toBe("blob:http://localhost:8089/photo-2");

    // Now resolve photo 1 (stale)
    window.URL.createObjectURL = vi
      .fn()
      .mockReturnValueOnce("blob:http://localhost:8089/photo-1");
    resolvePhoto1({
      data: new Blob(["photo1"]),
      headers: { "content-type": "image/jpeg" },
    });

    await new Promise((r) => setTimeout(r, 20));
    // MUST still be photo-2! Stale photo-1 must NOT overwrite!
    expect(resolvedUrl.value).toBe("blob:http://localhost:8089/photo-2");
  });

  it("rejects stale responses after cache clear and prevents repopulating the cache", async () => {
    let resolveRequest;
    api.get.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveRequest = resolve;
      }),
    );

    const pending = fetchAuthenticatedBlob("/api/attachments/stale/download");
    clearAuthenticatedBlobCache();

    resolveRequest({
      data: new Blob(["stale-bytes"], { type: "image/jpeg" }),
      headers: { "content-type": "image/jpeg" },
    });

    await expect(pending).rejects.toThrow("Sesi foto telah berubah");
    expect(window.URL.createObjectURL).not.toHaveBeenCalled();

    api.get.mockResolvedValueOnce({
      data: new Blob(["fresh-bytes"], { type: "image/jpeg" }),
      headers: { "content-type": "image/jpeg" },
    });
    await expect(
      fetchAuthenticatedBlob("/api/attachments/stale/download"),
    ).resolves.toBeTruthy();
    expect(api.get).toHaveBeenCalledTimes(2);
  });

  it("clears all cached Object URLs and revokes them upon logout", async () => {
    const mockBlob = new Blob(["cache-bytes"], { type: "image/jpeg" });
    api.get.mockResolvedValueOnce({
      data: mockBlob,
      headers: { "content-type": "image/jpeg" },
    });

    const createdUrl = "blob:http://localhost:8089/logout-test";
    window.URL.createObjectURL = vi.fn().mockReturnValueOnce(createdUrl);

    await fetchAuthenticatedBlob("/api/attachments/logout-photo/download");
    expect(window.URL.createObjectURL).toHaveBeenCalled();

    clearAuthenticatedBlobCache();
    expect(window.URL.revokeObjectURL).toHaveBeenCalledWith(createdUrl);
  });

  it("releases the prior ownership on same-URL reload", async () => {
    const mockBlob = new Blob(["reload-bytes"], { type: "image/jpeg" });
    api.get.mockResolvedValue({
      data: mockBlob,
      headers: { "content-type": "image/jpeg" },
    });
    let objectUrlIndex = 0;
    window.URL.createObjectURL = vi.fn(
      () => `blob:http://localhost:8089/reload-${++objectUrlIndex}`,
    );

    const source = ref("/api/attachments/reload-photo/download");
    const { resolvedUrl, reload } = useAuthenticatedPhoto(source);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(resolvedUrl.value).toBe("blob:http://localhost:8089/reload-1");

    await reload();
    // A cache hit returns the same Object URL, but the old ownership must be
    // released so the net reference count remains one for this composable.
    expect(resolvedUrl.value).toBe("blob:http://localhost:8089/reload-1");
    expect(api.get).toHaveBeenCalledTimes(1);

    clearAuthenticatedBlobCache();
    expect(window.URL.revokeObjectURL).toHaveBeenCalledWith(
      "blob:http://localhost:8089/reload-1",
    );
  });

  it("does not release a stale response as the current composable owner", async () => {
    let resolveFirst;
    let resolveSecond;
    api.get.mockImplementation(
      (url) =>
        new Promise((resolve) => {
          if (url.includes("race-first")) resolveFirst = resolve;
          else resolveSecond = resolve;
        }),
    );

    const source = ref("/api/attachments/race-first/download");
    const { resolvedUrl } = useAuthenticatedPhoto(source);
    source.value = "/api/attachments/race-second/download";
    await nextTick();

    window.URL.createObjectURL = vi
      .fn()
      .mockReturnValueOnce("blob:http://localhost:8089/race-second");
    resolveSecond({
      data: new Blob(["second"]),
      headers: { "content-type": "image/jpeg" },
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(resolvedUrl.value).toBe("blob:http://localhost:8089/race-second");

    window.URL.createObjectURL.mockReturnValueOnce(
      "blob:http://localhost:8089/race-first",
    );
    resolveFirst({
      data: new Blob(["first"]),
      headers: { "content-type": "image/jpeg" },
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(resolvedUrl.value).toBe("blob:http://localhost:8089/race-second");
    // Both requests have completed, but the stale response must not replace
    // the active composable result.
    expect(window.URL.createObjectURL).toHaveBeenCalledTimes(2);
  });

  it("renders AuthenticatedImage component and unmounts cleanly", async () => {
    const mockBlob = new Blob(["image-bytes"], { type: "image/jpeg" });
    api.get.mockResolvedValueOnce({
      data: mockBlob,
      headers: { "content-type": "image/jpeg" },
    });

    const wrapper = mount(AuthenticatedImage, {
      props: {
        src: "/api/attachments/att-67890/download",
        alt: "Bukti Foto GSP",
        imgClass: "test-img-class",
      },
    });

    await new Promise((r) => setTimeout(r, 50));
    await wrapper.vm.$nextTick();

    const img = wrapper.find("img");
    expect(img.exists()).toBe(true);
    expect(img.attributes("alt")).toBe("Bukti Foto GSP");
    expect(img.classes()).toContain("test-img-class");

    wrapper.unmount();
  });

  it("renders graceful fallback error UI on 401 Unauthorized or 403 Forbidden without breaking page", async () => {
    api.get.mockRejectedValueOnce({
      response: {
        status: 401,
        data: {
          message: "Unauthorized: Sesi kedaluwarsa atau token tidak valid",
        },
      },
    });

    const wrapper = mount(AuthenticatedImage, {
      props: {
        src: "/api/attachments/att-unauthorized/download",
      },
    });

    await new Promise((r) => setTimeout(r, 50));
    await wrapper.vm.$nextTick();

    expect(wrapper.find("img").exists()).toBe(false);
    expect(wrapper.text()).toContain("Foto Tidak Tersedia");
    expect(wrapper.find(".material-icons").text()).toBe("broken_image");
  });
});

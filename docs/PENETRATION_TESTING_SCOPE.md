# GMS Independent Penetration Testing Scope & Rules of Engagement

**Document Version:** 1.0.0  
**Target Application:** Gate Management System (GMS)  
**Standard:** OWASP Application Security Verification Standard (ASVS v4.0) Level 2 / PTES  

---

## 1. Scope Definition (In-Scope & Out-of-Scope)

### In-Scope Target Systems:
1. **Web Frontend:** Vue 3 SPA running over HTTPS reverse proxy (`https://<Target-FQDN>/`).
2. **REST API Gateway:** NestJS RESTful API (`https://<Target-FQDN>/api/*`).
3. **Authentication & Authorization Subsystems:**
   - Argon2id password authentication & lockout mechanisms.
   - Access JWT validation, revocation, and rotation.
   - HttpOnly secure refresh token cookie storage.
   - RBAC & Process-level Scopes (`ADMIN`, `SECURITY`, `QC`, `WAREHOUSE`).
4. **File Upload & Attachment Handlers:** Multipart uploads, magic byte validation, and download endpoints.
5. **Business Workflow Logic:** State machine transitions, Weighbridge calculations, Fraud detection, and Transaction Corrections.

### Out-of-Scope (Prohibited Actions):
1. Distributed Denial of Service (DDoS / Volumetric bandwidth flooding).
2. Physical security attacks against server hardware or on-premise infrastructure.
3. Social engineering / phishing against plant employees.
4. Permanent destruction or deletion of production data (testing MUST occur on isolated staging instance).

---

## 2. Test Focus Areas (OWASP Top 10 API & Web)

| Attack Vector | Focus Area | Specific GMS Component to Audit |
|:---|:---|:---|
| **BOLA / IDOR** | Broken Object Level Authorization | Manipulate transaction IDs, attachment IDs, and user IDs across tenant scopes. |
| **BFLA** | Broken Function Level Authorization | Attempt to invoke `/api/transactions/correct-operation-log` as non-Admin. |
| **Race Conditions** | Concurrency & Lost Updates | Concurrent check-in of identical plate; concurrent correction submission (Verify 409 Conflict). |
| **Improper Assets** | Mock / Debug Routes in Production | Verify `/mockServiceWorker.js`, Swagger docs, or debug tools are absent in production. |
| **Mass Assignment** | DTO Parameter Injection | Attempt to inject `role=ADMIN` or bypass whitelist validation pipes. |
| **Path Traversal** | Attachment Download / Storage | Attempt `../../` directory traversal via attachment download endpoints. |

---

## 3. Engagement Window & Reporting

- **Reporting SLA:** Critical vulnerabilities must be reported immediately within 4 hours.
- **Deliverables:** Executive Summary, Technical Finding Details with CVSS v3.1 Scores, Proof-of-Concept (PoC) scripts, and Remediation Guidance.

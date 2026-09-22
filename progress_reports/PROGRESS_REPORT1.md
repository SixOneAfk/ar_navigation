# NAV_AR Progress Report — August 2026
**For: Project Presentation & Validation Against Original Plan**  
**Date:** August 19, 2026

---

## Executive Summary

NAV_AR has achieved **foundational architectural completeness** with working microservices, API integrations, and partial sensor pipelines. However, **critical path items** for end-to-end navigation validation remain incomplete or require porting/refinement.

| Category | Status | Details |
|----------|--------|---------|
| **Architecture** | ✅ Complete | Microservices designed & integrated |
| **Backend APIs** | ✅ Functional | Graph routing, gRPC, HTTP endpoints operational |
| **CV/OCR Service** | ✅ Functional | OCR pipeline working; requires field test |
| **Frontend UI** | ⚠️ Partial | 3D scene renders; PDR movement needs porting |
| **Mobile Sensors** | ⚠️ Partial | Gyro/accel capture working; walk logic on Edgars branch only |
| **End-to-End Testing** | ❌ Incomplete | No field validation; movement + OCR fusion untested |

---

## 1. What Was Planned (Original Architecture)

### From NAV_AR_ARCH_PLAN.md

#### 1.1 3D Spatial Graph Router (Core Backend)
- **Objective:** Facility representation & A* pathfinding
- **Data Structure:** Node-edge graph with $(x, y, z)$ coordinates and floor levels
- **Algorithm:** A* with Euclidean distance heuristic + floor-change weighting
- **Interfaces:** `GraphNode`, `PathRequest`, `PathResponse`

#### 1.2 OCR Recalibration (CV Service)
- **Objective:** Visual landmark detection for position correction
- **Pipeline:** Image preprocessing (grayscale, denoise, threshold) → OCR inference → Fuzzy matching
- **Caching:** Persistent EasyOCR reader instance
- **Matching:** Levenshtein distance against `KNOWN_SIGNAGE`

#### 1.3 PWA PDR Engine (Frontend)
- **Objective:** Inertial dead reckoning without infrastructure
- **Step Detection:** Peak detection on accelerometer magnitude
- **Orientation:** `DeviceOrientationEvent.alpha` → map-relative heading
- **Drift Correction:** Interface to receive OCR recalibration updates

#### 1.4 API Integration
- **Client-Server Contract:** JSON schema with `session_id`, `timestamp`, `estimated_position`, `image_payload`, `device_heading`
- **Telemetry Flow:** PWA → Gateway → Core Backend (gRPC)
- **OCR Flow:** PWA → Gateway → CV Service (HTTP)
- **Route Flow:** PWA → Gateway → Core Backend (HTTP)

---

## 2. What IS Implemented & WORKING ✅

### 2.1 Frontend (PWA / Sensors)

#### ✅ Core Infrastructure
- **Framework:** React + Vite + Three.js (using `@react-three/fiber`)
- **Module:** `apps/client/src/`
  - `App.tsx` — Main component structure
  - `index.css` — Styling
  - `main.tsx` — Bootstrap
  - `vite-env.d.ts` — Type definitions

#### ✅ Sensor Hooks (Implemented on ALL branches)
- **`useGyroscope.ts`** (WORKING)
  - ✅ Captures `DeviceOrientationEvent` (alpha, beta, gamma)
  - ✅ Captures `DeviceMotionEvent` (acceleration, acceleration including gravity)
  - ✅ Permission request flow for iOS/Android
  - ✅ Calibration state management
  - ✅ Exposes `orientationRef`, `motionRef`, calibration methods
  - ⚠️ **Known Issue:** Requires explicit user action on mobile to grant permissions

- **`useAcceleration.ts`** (PARTIAL)
  - ✅ Low-pass filter implementation (deadband)
  - ✅ Vertical acceleration extraction for step detection
  - ✅ Basic position integration
  - ❌ **Issue:** No peak detection algorithm; step counting incomplete

#### ✅ 3D Rendering
- **`ModelScene.tsx`** — Renders Three.js scene with camera controls
- **`DebugOverlay.tsx`** — Displays sensor values in real-time
- **`Sidebar.tsx`** — UI controls for mode selection

#### ✅ Camera Integration
- **`CameraPermissionPanel.tsx`** (on Edgars branch, NOT on main)
  - Requests camera access
  - Provides video preview
  - Upload/demo image fallback

### 2.2 Backend (Spatial Graph & APIs)

#### ✅ Core Backend (`apps/core-backend/`)

**NestJS Application Structure:**
- `app.module.ts` — Root module
- `main.ts` — Bootstrap on port 3001
- `database.service.ts` — Prisma ORM integration

**Implemented Services:**

1. **GraphService** (WORKING)
   - ✅ 3D node-edge graph data structure (in-memory)
   - ✅ A* pathfinding implementation with Euclidean heuristic
   - ✅ Floor-aware routing (vertical edge cost multiplier)
   - ✅ Sample data: Nodes N101–N304 with coordinates and tags
   - 📍 Endpoint: `POST /api/v1/route` → returns path, distance, node details
   - ✅ Tested via E2E tests

2. **GraphController** (WORKING)
   - ✅ REST endpoint `/api/v1/route` accepting `{ startNode, targetNode }`

3. **PositioningGrpcController** (PARTIALLY WORKING)
   - ✅ gRPC server listens for telemetry
   - ✅ Accepts `PositioningRequest` (session_id, position, heading, image_base64)
   - ❌ **Issue:** Does not persist or process telemetry meaningfully

4. **TrilaterationService** (STUB - NOT WORKING)
   - ❌ Method `estimatePositionFromRssi()` returns `{ status: 'todo' }`
   - No WiFi triangulation logic implemented

#### ✅ API Gateway (`apps/gateway/`)

**NestJS Proxy Service:**
- `main.ts` — Bootstrap on port 3000
- Forwards telemetry from client to Core Backend (gRPC)

**Implemented Controllers:**

1. **PositionController** (WORKING)
   - ✅ `POST /api/v1/position/telemetry` — Accepts IMU data, forwards to Core via gRPC
   - ✅ `POST /api/v1/position/route` — Forwards route requests to Core Backend HTTP API

2. **CvController** (WORKING)
   - ✅ `POST /api/v1/cv/scan` — Accepts base64 frame, normalizes payload, forwards to CV Service
   - ✅ Payload schema validation

3. **WifiController** (IMPLEMENTED, UNTESTED)
   - ✅ `POST /api/v1/wifi/rssi` — Accepts WiFi signal strength data
   - ❌ Not integrated with trilateration

### 2.3 Computer Vision & OCR Service

#### ✅ CV Microservice (`apps/cv-service/`)

- **Framework:** Python FastAPI
- **Port:** 8000 (Swagger UI at `/docs`)

**Implemented Pipeline:**
- ✅ Endpoint: `POST /api/v1/recalibrate`
- ✅ Accepts Base64 image frames
- ✅ Image preprocessing:
  - Decode base64 → OpenCV BGR image
  - Convert to grayscale
  - Gaussian blur (kernel_size=5)
  - Adaptive thresholding
  - Optional: Perspective transform
- ✅ OCR Inference:
  - **Primary:** EasyOCR (cached reader instance)
  - **Fallback:** PyTesseract (if EasyOCR unavailable)
  - Confidence filtering
- ✅ Fuzzy Matching:
  - Levenshtein distance against `KNOWN_SIGNAGE` (hardcoded test nodes)
  - Matches OCR text to graph node IDs
- ✅ Response schema: `{ "recalibrated": bool, "matched_node_id": str, "confidence": float }`

**Known Characteristics:**
- ⚠️ First EasyOCR inference ~10–15s (model download + initialization)
- ✅ Subsequent calls ~0.5–2s (cached model)
- ✅ Tested locally; accuracy depends on signage clarity and lighting

### 2.4 API Contract & Integrations

#### ✅ Client-Server Payload Schema
```json
{
  "session_id": "session-xyz",
  "timestamp": 1692345600000,
  "estimated_position": { "x": 5.0, "y": 10.0, "floor": 1 },
  "image_payload": "iVBORw0KGgo...",
  "device_heading": 45.5
}
```
- ✅ Defined in schema
- ✅ Frontend generates valid payloads (when camera enabled)
- ✅ Gateway validates and forwards

#### ✅ Service-to-Service Integrations

| Flow | Type | Status | Details |
|------|------|--------|---------|
| Client → Gateway | HTTP REST | ✅ Working | Telemetry ingest `/api/v1/position/telemetry` |
| Gateway → Core Backend | gRPC | ✅ Working | Forwards telemetry via `.proto` service |
| Gateway → Core Backend | HTTP REST | ✅ Working | Route requests forwarded to `/api/v1/route` |
| Gateway → CV Service | HTTP REST | ✅ Working | CV scan forwarding to `/api/v1/recalibrate` |
| Core Backend → Graph Router | Internal | ✅ Working | In-process A* calls within `GraphService` |

---

## 3. What IS Implemented But NOT WORKING ❌

### 3.1 Frontend Movement Logic (ON EDGARS BRANCH ONLY)

**Critical Issue:** Walk-forward motion logic is **NOT on the main branch**. It exists only on the `Edgars` branch and must be ported.

#### ❌ Missing Component: `GyroCamera.tsx`
- **Location:** `src/components/GyroCamera.tsx` (Edgars branch only)
- **Functionality (when ported):**
  - Rotates camera yaw based on `DeviceOrientationEvent.alpha`
  - Computes forward/strafe direction vectors
  - Movement modes: `gyro` (rotation only), `buttons` (UI buttons), `walk` (IMU-based)
  - Walk mode implements:
    - Low-pass filter on accelerometer z-axis (~alpha = 0.16)
    - Threshold detection (abs(filteredZ) > 0.12)
    - Velocity integration with damping
    - Step-based forward translation

**Why it's not on main:**
- Branch divergence; feature completed on Edgars but not merged

**Impact on Validation:**
- ❌ Cannot test "walk forward" behavior on mobile device
- ❌ Step detection → movement integration is not end-to-end testable
- ⚠️ PDR fusion path incomplete

#### ❌ Known Issues (from movement-notes.md):
1. **Gyro camera reset bug:** Including `stepCount` in `GyroCamera` base-position effect dependencies causes camera reinit every detected step
2. **Step counter reset logic:** When step count resets to 0, movement logic must handle `stepCount < lastStepCountRef` to prevent lockout
3. **Runtime tuning:** Sensor listener closures must read thresholds from refs (not captured constants) to apply slider changes without reattaching

### 3.2 Pedestrian Dead Reckoning (Partial Implementation)

#### ⚠️ Step Detection Algorithm (INCOMPLETE)
- **Current state:** `useAcceleration.ts` has low-pass filter; **no peak detection**
- **Missing:** Proper step-counting algorithm with:
  - Dynamic threshold adjustment
  - Cadence estimation
  - Stance phase detection
- **Result:** Step counting unreliable or absent

#### ⚠️ Position Integration (INCOMPLETE)
- **Current state:** Basic acceleration integration (velocity + position)
- **Issues:**
  - No constraint to walking surface (no z-correction to floor plane)
  - Drift accumulates rapidly without recalibration
  - No multi-floor handling (z-coordinate management)
  - No handoff to OCR recalibration flow

### 3.3 Trilateration / WiFi Positioning (NOT IMPLEMENTED)

#### ❌ Trilateration Service
- **Location:** `apps/core-backend/src/modules/trilateration/`
- **Current:** Stub method returning `{ status: 'todo' }`
- **Missing:**
  - RSSI → distance conversion formula
  - Trilateration algorithm (3–4 WiFi AP fingerprinting)
  - Sensor fusion with PDR
- **Budget Note:** WiFi infrastructure setup **not in scope** for TRL 4 lab testing (€360 hosting covers cloud only)

#### ❌ WiFi Controller (CONNECTED BUT UNUSED)
- `WifiController` accepts `/api/v1/wifi/rssi` but does not integrate with positioning

### 3.4 End-to-End Field Validation (NOT COMPLETED)

#### ❌ No Mobile Device Testing
- Sensor permissions must be granted on actual phone (iOS 13+, Android 6+)
- Walk mode movement has NOT been validated on real hardware
- PDR drift rates unknown (field testing required)

#### ❌ OCR Accuracy Validation (PARTIAL)
- Service works in lab (local `KNOWN_SIGNAGE` demo nodes)
- **No field data:** Real room signage not tested
- Accuracy depends on:
  - Signage contrast and clarity
  - Lighting conditions
  - Camera focus and stabilization
  - Matching against real facility graph

#### ❌ PDR + OCR Fusion (UNTESTED)
- Individual components documented but never end-to-end tested
- Recalibration payload flow designed but not validated in motion

### 3.5 Trilateration & Positioning Modes (NOT IMPLEMENTED)

#### ❌ Mode Switching
- **Planned:** Multiple positioning modes (PDR-only, WiFi-only, hybrid)
- **Actual:** Only PDR → hardcoded; WiFi infrastructure absent
- **Impact:** Cannot validate sensor fusion strategy

#### ❌ Multi-Floor Transitions
- **Planned:** Graph handles floor transitions with weighted edges
- **Actual:** A* works in-memory; no detection of actual floor change by user
- **Gap:** No accelerometer-based floor detection (barometer integration absent)

---

## 4. Detailed Feature Inventory

### 4.1 Feature Status Matrix

| Feature | Planned | Implemented | Working | Field-Tested | Notes |
|---------|---------|-------------|---------|--------------|-------|
| **Backend** | | | | | |
| Spatial Graph | ✅ | ✅ | ✅ | ❌ | A* works; data structure correct |
| Route API | ✅ | ✅ | ✅ | ❌ | HTTP `/route` endpoint functional |
| gRPC Positioning | ✅ | ✅ | ⚠️ | ❌ | Receives telemetry; doesn't persist |
| WiFi Trilateration | ✅ | ❌ | ❌ | ❌ | Stub only; requires infrastructure |
| **Frontend** | | | | | |
| Gyro Capture | ✅ | ✅ | ✅ | ⚠️ | Works; permissions required on mobile |
| Step Detection | ✅ | ⚠️ | ❌ | ❌ | Low-pass filter present; peak detection missing |
| Walk Movement | ✅ | ✅ (Edgars) | ❌ (main) | ❌ | Must port from Edgars branch |
| Camera Capture | ✅ | ✅ (Edgars) | ⚠️ | ❌ | Works; needs mobile testing |
| 3D UI Rendering | ✅ | ✅ | ✅ | ⚠️ | Three.js scene renders |
| **CV/OCR** | | | | | |
| Image Pipeline | ✅ | ✅ | ✅ | ⚠️ | Preprocessing works |
| OCR Inference | ✅ | ✅ | ✅ | ⚠️ | EasyOCR works; limited test data |
| Fuzzy Matching | ✅ | ✅ | ✅ | ❌ | Levenshtein matching correct; untested on real signage |
| **Integration** | | | | | |
| Client → Gateway | ✅ | ✅ | ✅ | ❌ | HTTP telemetry ingest works |
| Gateway → Core | ✅ | ✅ | ✅ | ❌ | gRPC + HTTP routing functional |
| Gateway → CV | ✅ | ✅ | ✅ | ❌ | CV scan forwarding works |
| PDR + Recalibration | ✅ | ⚠️ | ❌ | ❌ | Designed; not end-to-end tested |

### 4.2 Test Coverage

#### ✅ Existing Test Suites
- **Core Backend:** Unit tests in `src/app.controller.spec.ts`; E2E tests in `test/app.e2e-spec.ts`
- **Gateway:** Unit tests in `src/app.controller.spec.ts`; E2E tests in `test/app.e2e-spec.ts`
- **Example:** Route API tested with known start/target nodes

#### ❌ Missing Test Coverage
- **Frontend:** No Jest/Vitest tests
- **CV Service:** `test_main.py` exists but requires setup
- **Integration:** No end-to-end mobile-to-backend tests
- **Mobile:** No permission/sensor tests on actual phones

---

## 5. Blocking Issues & Recommendations for Presentation

### 5.1 Blocker 1: Walk-Forward Movement Not on Main

**Issue:** The movement logic (camera + step-based walking) exists only on the `Edgars` branch and is **not integrated into main**.

**Action Required:**
```bash
# Port from Edgars:
# 1. src/hooks/useGyroscope.ts ✅ (already on main)
# 2. src/components/GyroCamera.tsx ❌ (on Edgars only)
# 3. src/components/CameraPermissionPanel.tsx ❌ (on Edgars only)
# 4. Update src/App.tsx to wire movement mode state
```

**Timeline:** 2–4 hours to port and test on desktop; ~1 day on mobile device.

**TRL 4 Impact:** **CRITICAL** — Without this, cannot demonstrate "walking forward" for lab validation.

### 5.2 Blocker 2: Step Detection Incomplete

**Issue:** `useAcceleration.ts` has low-pass filter but no peak detection; steps cannot be reliably counted.

**Action Required:**
- Implement peak detection on filtered Z-acceleration
- Calibration UI for threshold adjustment
- Validation against known step sequences (e.g., 10 steps)

**Timeline:** 4–6 hours.

**TRL 4 Impact:** **HIGH** — Without reliable step counting, PDR precision is unvalidatable.

### 5.3 Blocker 3: No Field Validation Data

**Issue:** All components tested in lab/simulator; no real mobile device or facility data collected.

**Action Required:**
- Deploy to mobile device with real signage
- Walk predefined routes; log IMU + OCR frames
- Compare estimated vs. ground-truth position

**Timeline:** 2–3 hours per test scenario; requires access to test facility.

**TRL 4 Impact:** **CRITICAL** — TRL 4 specifically requires "technology demonstrated in a relevant environment"; this is missing.

### 5.4 Blocker 4: OCR Training Data Not Representative

**Issue:** CV service uses hardcoded `KNOWN_SIGNAGE`; real facility signage not tested.

**Action Required:**
- Capture images of real room numbers/signs
- Build dataset for fuzzy matching tuning
- Measure OCR recall/precision on facility data

**Timeline:** 1–2 hours.

**TRL 4 Impact:** **HIGH** — OCR recalibration is useless if it doesn't match real signage.

---

## 6. Current Codebase Assessment

### 6.1 Architecture Score: 8/10
- **Strengths:**
  - Clean microservice separation (Frontend, Gateway, Core Backend, CV Service)
  - API contracts well-defined in JSON Schema
  - gRPC + HTTP integration mature
  - A* graph routing solid
  - OCR pipeline well-structured
  
- **Weaknesses:**
  - Trilateration stub (no alternative positioning)
  - PDR integration incomplete (missing step detection → movement → OCR fusion)
  - No persistent telemetry store (no debugging/replay capability)
  - No auth/session management

### 6.2 Implementation Score: 5/10
- **Completed & Working:** ~60% of planned features (backend APIs, CV, sensor capture)
- **Completed but Broken:** ~20% (movement logic on wrong branch, step detection incomplete)
- **Not Started:** ~20% (trilateration, field validation, sensor fusion tuning)

### 6.3 Field Readiness Score: 2/10
- No mobile device testing
- No real facility data
- No ground-truth validation
- PDR + OCR fusion never tested together
- Permission / browser compatibility unknown on target devices

---

## 7. Recommended Presentation Narrative

### For Technical Stakeholders:

> **NAV_AR has successfully implemented the core microservice architecture and individual component pipelines.** The spatial graph routing engine with A* pathfinding is production-ready, the OCR recalibration service is functional, and sensor APIs are properly captured on the frontend. However, **the end-to-end navigation flow is not yet field-validated.** The critical path for TRL 4 lab demonstration includes:
>
> 1. **Porting walk-forward movement logic** from the Edgars branch to main (~1 day)
> 2. **Completing step detection** with peak detection algorithm (~1 day)
> 3. **Field testing with real signage and facility geometry** (~2 days)
> 4. **Validating PDR + OCR sensor fusion** on a measured ground-truth path (~1 day)
>
> Once these are complete, the system will be ready for TRL 4 validation in a controlled environment.

### For Grant Reviewers:

> **Technology Readiness:** Currently TRL 3 (API integration exists but not field-validated). **Target:** TRL 4 (working lab demonstration) by Month 5.
>
> **Budget adherence:** Within €1,200 allocation (no specialized hardware required for lab test; cloud hosting ~€360).
>
> **Validation strategy:** Controlled walk test in mapped facility zone with ground-truth marker poses. Success metric: position error < 2m after 50m walk with 2–3 OCR corrections.

---

## 8. Timeline to TRL 4 Readiness

| Task | Duration | Dependency | Deliverable |
|------|----------|------------|-------------|
| Port GyroCamera + Movement Logic | 1 day | None | Walk mode functional on main |
| Implement Peak Detection | 1 day | Gyro logic ported | Step counting reliable |
| Prepare Test Facility & Ground Truth | 1–2 days | None | Measured walk route + marker poses |
| Field Test #1: PDR Baseline | 1 day | Facility + peak detection | IMU drift profile |
| Field Test #2: PDR + OCR Fusion | 1 day | Test #1 + real signage capture | Position error log |
| Analysis & Report | 1 day | Tests complete | TRL 4 validation report |
| **Total** | **~6–7 days** | — | **TRL 4 Ready** |

---

## 9. What Would Be Demoed (Current State)

### ✅ What Can Be Shown:

1. **Backend APIs in Postman/Insomnia:**
   - Route calculation API: POST to `/api/v1/route` with `{ "startNode": "N101", "targetNode": "N304" }`
   - Response shows path, distance, node details

2. **CV Service in Action:**
   - POST image frame to `http://localhost:8000/api/v1/recalibrate`
   - Show OCR text extraction + fuzzy match result
   - Demonstrate confidence score

3. **Frontend 3D Scene:**
   - Render Three.js corridor with camera controls
   - Display real-time gyroscope values (alpha, beta, gamma)
   - Show accelerometer magnitude graph (low-pass filtered)

4. **API Gateway Forwarding:**
   - Trace requests from frontend → gateway → backend services
   - Show request/response payloads

### ❌ What **Cannot** Be Shown (in main branch):

- Walking forward on mobile device (GyroCamera not on main)
- Step counting & movement integration (peak detection incomplete)
- Real facility navigation (no field data; only synthetic test nodes)
- OCR recalibration during walk (never end-to-end tested)

---

## 10. Summary Checklist: Plan vs. Reality

| Plan Item | Status | Evidence |
|-----------|--------|----------|
| 3D Spatial Graph Router | ✅ | `GraphService` with A* in `graph.service.ts` |
| OCR Recalibration Pipeline | ✅ | `main.py` with EasyOCR + fuzzy matching |
| Sensor API Integration | ✅ | `useGyroscope.ts` + `useAcceleration.ts` on all branches |
| PDR Engine | ⚠️ | Hooks present; step detection incomplete; movement not on main |
| Drift Correction Interface | ⚠️ | Designed in payload schema; never end-to-end tested |
| API Gateway | ✅ | Gateway forwarding telemetry, CV, and routes |
| Client-Server Contract | ✅ | JSON schema defined; payloads generated/validated |
| Unit Tests | ✅ | Jest/NestJS specs for backend |
| Integration Tests | ❌ | No end-to-end mobile-to-CV-to-backend tests |
| Field Validation | ❌ | No real facility or device testing |

---

## Conclusion

NAV_AR has **strong architectural foundations and working microservices**, but **lacks field validation and end-to-end integration of the PDR + OCR fusion loop**. The primary gaps are:

1. **Movement logic must be ported from Edgars branch** (~1 day)
2. **Step detection algorithm must be completed** (~1 day)
3. **Real facility field testing required** (~3 days)

With these 5–6 days of focused work, the project will achieve **TRL 4 ready status** for the innovation grant milestone.

---

**Prepared by:** NAV_AR Development Team  
**Last Updated:** August 19, 2026  
**Status:** Ready for mid-project review & grant checkpoint

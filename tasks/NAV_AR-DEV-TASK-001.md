# Agent Task Specification: Nav_Ar System Architecture & Core Prototype Development

**Task ID:** `NAV_AR-DEV-TASK-001`

**Target Role:** Autonomous Full-Stack & Spatial Computing Developer Agent

**Project:** Nav_Ar Indoor Navigation System (TSI Student Innovation Grant Project No. 1.1.1.7/1/25/A/004)

**Target Maturity:** Technology Readiness Level 4 (TRL 4) Prototype

**Budget & Duration Constraints:** €1,200 total budget across a 6-month implementation timeline

---

## 1. System Overview & Architectural Mandate

The primary goal of this task is to develop and integrate the core functional components for **Nav_Ar**—an infrastructure-light, browser-based indoor navigation solution designed to operate without dedicated physical hardware like BLE beacons or Wi-Fi positioning nodes.

```
+-----------------------------------------------------------------------------------+
|                                 CLIENT SIDE (PWA)                                 |
|  +---------------------------+   +-------------------+   +--------------------+  |
|  | DeviceMotion / Sensor API |   |  Camera Stream /  |   |  Navigation UI /   |  |
|  |  (Inertial Dead Reckon.)  |   | Video Frame Grab  |   | 2D/3D Directional  |  |
|  +-------------+-------------+   +---------+---------+   +---------+----------+  |
+----------------|---------------------------|-----------------------^--------------+
                 | Sensors (IMU Data)        | Image Payload (Base64)| Navigation Path
                 v                           v                       | & Recalibration
+--------------------------------------------------------------------|--------------+
|                                BACKEND MICROSERVICES               |              |
|  +-----------------------------------------+   +-------------------+------------+  |
|  |       Spatial Graph & Routing REST API  |   |   Python OCR Recalibration    |  |
|  |   (3D Node Graph / A* Pathfinding)      |---|          Microservice          |  |
|  +-----------------------------------------+   +--------------------------------+  |
+-----------------------------------------------------------------------------------+

```

### Key Functional Requirements

* **Browser-Based Access:** Deliver a Progressive Web Application (PWA) accessible via standard mobile browsers without requiring native application installation.


* **Pedestrian Dead Reckoning (PDR):** Process smartphone inertial measurement unit (IMU) sensor data (accelerometer and gyroscope) to estimate relative user movement.


* **Visual Landmark Recalibration:** Implement a Python computer vision microservice utilizing Optical Character Recognition (OCR) on visible room numbers/signage to correct inertial position drift.


* **3D Spatial Graph Routing:** Serve topological spatial graph data of the mapped test facility zone and calculate shortest paths using A* or Dijkstra routing algorithms.



---

## 2. Technical Stack Matrix

| Layer / Component | Technology Stack | Function & Operational Context |
| --- | --- | --- |
| **Frontend Framework** | HTML5 PWA / TypeScript / Three.js | Mobile UI, sensor sampling, video stream capture, and path rendering.

 |
| **Sensor Processing** | Web DeviceMotionEvent & DeviceOrientationEvent APIs | Relative step counting and heading estimation.

 |
| **Backend API Layer** | Python FastAPI / Node.js | Microservice orchestration, REST endpoints, and graph data delivery.

 |
| **Routing Engine** | NetworkX / PostGIS Spatial Extensions | 3D indoor node-edge graph modeling and pathfinding.

 |
| **OCR Microservice** | OpenCV / EasyOCR / PyTesseract | Optical character recognition on incoming camera frames.

 |

---

## 3. Detailed Work Breakdown Structure (WBS) & Tasks

Following project management guidelines for work package decomposition, the agent must execute the following modular development phases aligned with the 6-month Gantt schedule:

```
Nav_Ar Core Implementation (WBS Level 1)
├── 1.1 Backend Spatial Routing Engine (Month 2-3)
│   ├── 1.1.1 3D Facility Graph Data Schema Definition
│   └── 1.1.2 REST Route Calculation Engine Implementation
├── 1.2 Python OCR Recalibration Service (Month 3-4)
│   ├── 1.2.1 Image Pre-processing Pipeline (OpenCV)
│   └── 1.2.2 Text Extraction & Node Matching Logic
├── 1.3 Mobile Sensor Ingestion & PWA Engine (Month 2-4)
│   ├── 1.3.1 Sensor API Listener & Step-Detection Implementation
│   └── 1.3.2 Frontend Route Visualization & Drift Adjustment UI
└── 1.4 Integration & Sensor Fusion Calibration (Month 4-5)
    ├── 1.4.1 Client-Server Communication API Pipeline
    └── 1.4.2 Field Test Data Logging & Performance Tuning

```

### Module 1: Spatial Graph Data Structure & Routing API

* **Objective:** Store topological facility representations (nodes, edges, elevation/floor metadata) and compute optimal navigation paths.


* **Tasks:**
1. Define a JSON schema for nodes (representing rooms, hallway junctions, staircases) and edges (representing walkable corridors).
2. Implement an A* pathfinding algorithm operating across 3D coordinates $(x, y, z)$ to support multi-floor routing.



### Module 2: Python OCR Landmark Recalibration Service

* **Objective:** Extract alphanumeric text from door signs/room numbers and return corrected graph node identifiers.


* **Tasks:**
1. Build a lightweight REST API endpoint (`/api/v1/recalibrate`) accepting compressed image frames.
2. Apply grayscale conversion, thresholding, and contour filtering prior to OCR parsing.
3. Match extracted text against registered node tags in the spatial graph database to update user position.



### Module 3: Frontend PWA Sensor Listener & Dead Reckoning

* **Objective:** Capture browser inertial events to estimate step frequency and orientation changes.


* **Tasks:**
1. Request user permission for `DeviceMotionEvent` and `DeviceOrientationEvent` access on modern WebKit/Blink platforms.
2. Implement peak-detection algorithms on acceleration vectors to detect pedestrian steps.



---

## 4. Production-Ready Technical Implementations

### 4.1 Backend Spatial Routing Engine (`graph_router.py`)

```python
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import networkx as nx
from typing import List, Dict, Tuple

app = FastAPI(title="Nav_Ar Spatial Routing Microservice", version="1.0.0")

# 3D Node Representation: id -> (x, y, z_floor, node_tag)
NODES_DB: Dict[str, Dict] = {
    "N101": {"x": 0.0, "y": 0.0, "floor": 1, "tag": "ROOM_101"},
    "N102": {"x": 12.5, "y": 0.0, "floor": 1, "tag": "HALLWAY_CORNER_1"},
    "N103": {"x": 12.5, "y": 15.0, "floor": 1, "tag": "ROOM_102"},
    "N104": {"x": 12.5, "y": 15.0, "floor": 2, "tag": "STAIRWELL_FL2"},
}

# Graph initialization
graph = nx.Graph()

# Populate nodes
for node_id, data in NODES_DB.items():
    graph.add_node(node_id, **data)

# Populate edges with calculated Euclidean 3D weights
def calculate_distance(n1: str, n2: str) -> float:
    d1, d2 = NODES_DB[n1], NODES_DB[n2]
    return ((d1["x"] - d2["x"])**2 + (d1["y"] - d2["y"])**2 + ((d1["floor"] - d2["floor"]) * 4.0)**2) ** 0.5

edges = [("N101", "N102"), ("N102", "N103"), ("N103", "N104")]
for u, v in edges:
    graph.add_edge(u, v, weight=calculate_distance(u, v))

class PathRequest(BaseModel):
    start_node: str
    target_node: str

class PathResponse(BaseModel):
    path: List[str]
    total_distance: float
    nodes_detail: List[Dict]

@app.post("/api/v1/route", response_model=PathResponse)
def compute_route(request: PathRequest):
    if request.start_node not in graph or request.target_node not in graph:
        raise HTTPException(status_code=404, detail="Start or Target Node not found in spatial graph.")
    
    try:
        path = nx.astar_path(graph, request.start_node, request.target_node, weight="weight")
        total_dist = nx.path_weight(graph, path, weight="weight")
        nodes_detail = [{"id": n, **NODES_DB[n]} for n in path]
        
        return PathResponse(
            path=path,
            total_distance=round(total_dist, 2),
            nodes_detail=nodes_detail
        )
    except nx.NetworkXNoPath:
        raise HTTPException(status_code=400, detail="No valid path exists between specified nodes.")

```

### 4.2 OCR Landmark Recalibration Service (`ocr_service.py`)

```python
import cv2
import numpy as np
import easyocr
from fastapi import FastAPI, UploadFile, File, HTTPException
import re

app = FastAPI(title="Nav_Ar Visual OCR Microservice", version="1.0.0")

# Initialize reader once for performance optimization
ocr_reader = easyocr.Reader(['en'], gpu=False)

# Mapped physical signage dictionary
KNOWN_SIGNAGE = {
    "101": "N101",
    "102": "N103",
    "STAIRS-F2": "N104"
}

@app.post("/api/v1/recalibrate")
async def recalibrate_position(file: UploadFile = File(...)):
    contents = await file.read()
    nparr = np.frombuffer(contents, np.uint8)
    image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    
    if image is None:
        raise HTTPException(status_code=400, detail="Invalid image payload.")
        
    # Pre-processing pipeline
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    denoised = cv2.fastNlMeansDenoising(gray, h=10)
    
    # Run OCR inference
    results = ocr_reader.readtext(denoised)
    
    for bbox, text, confidence in results:
        clean_text = re.sub(r'[^A-Z0-9-]', '', text.upper())
        if confidence > 0.40 and clean_text in KNOWN_SIGNAGE:
            matched_node_id = KNOWN_SIGNAGE[clean_text]
            return {
                "recalibrated": True,
                "detected_text": clean_text,
                "confidence": float(confidence),
                "matched_node_id": matched_node_id
            }
            
    return {
        "recalibrated": False,
        "detected_text": None,
        "confidence": 0.0,
        "matched_node_id": None
    }

```

### 4.3 PWA Sensor Integration & Dead Reckoning Engine (`pdr_engine.ts`)

```typescript
export interface PDRPosition {
    x: number;
    y: number;
    heading: number;
    stepCount: number;
}

export class PDRService {
    private position: PDRPosition = { x: 0, y: 0, heading: 0, stepCount: 0 };
    private stepThreshold: number = 1.2; // Accel magnitude peak threshold
    private lastAccelMagnitude: number = 0;
    private stepLength: number = 0.7; // Standard stride length in meters

    public async requestPermissions(): Promise<boolean> {
        if (typeof (DeviceMotionEvent as any).requestPermission === 'function') {
            const motionPerm = await (DeviceMotionEvent as any).requestPermission();
            const orientPerm = await (DeviceOrientationEvent as any).requestPermission();
            return motionPerm === 'granted' && orientPerm === 'granted';
        }
        return true; // Non-iOS modern browsers
    }

    public startTracking(onPositionUpdate: (pos: PDRPosition) => void): void {
        window.addEventListener('deviceorientation', (event: DeviceOrientationEvent) => {
            if (event.alpha !== null) {
                // Convert compass heading (alpha) to radians relative to map coordinate space
                this.position.heading = (360 - event.alpha) * (Math.PI / 180);
            }
        });

        window.addEventListener('devicemotion', (event: DeviceMotionEvent) => {
            const acc = event.accelerationIncludingGravity;
            if (!acc || acc.x === null || acc.y === null || acc.z === null) return;

            const magnitude = Math.sqrt(acc.x * acc.x + acc.y * acc.y + acc.z * acc.z);
            const delta = magnitude - this.lastAccelMagnitude;
            this.lastAccelMagnitude = magnitude;

            // Simple peak detection for step estimation
            if (delta > this.stepThreshold) {
                this.position.stepCount++;
                this.position.x += this.stepLength * Math.sin(this.position.heading);
                this.position.y += this.stepLength * Math.cos(this.position.heading);
                onPositionUpdate({ ...this.position });
            }
        });
    }

    public recalibratePosition(correctedX: number, correctedY: number): void {
        this.position.x = correctedX;
        this.position.y = correctedY;
    }
}

```

---

## 5. Acceptance Criteria & Quality Assurance Metrics

To ensure strict compliance with European and TSI Innovation Grant audit standards for TRL 4 prototypes, the agent's deliverables must fulfill the following operational criteria:

### 5.1 System Performance Targets

* **OCR Microservice Latency:** Process incoming video frame requests and respond within $\le 300\text{ ms}$ on standard server infrastructure.


* **Route Calculation Overhead:** Compute A* pathfinding queries across at least 100 spatial graph nodes within $\le 50\text{ ms}$.


* **Positional Drift Recalibration:** Successfully reset accumulating inertial position errors upon identifying registered room signage with $\ge 40\%$ OCR confidence.



### 5.2 Project Management & Risk Mitigation Controls

Aligned with formal project management practices:

| Identified Risk | Risk Severity | Planned Response Strategy | Operational Execution |
| --- | --- | --- | --- |
| **Inertial Sensor Drift** | High Impact / High Likelihood | Mitigation

 | Implement periodic OCR recalibration triggers at corridor junctions.

 |
| **OCR Misclassification** | Medium Impact / Medium Likelihood | Mitigation

 | Apply strict confidence threshold filtering ($\ge 40\%$) and regex matching.

 |
| **Browser API Restrictions** | High Impact / Low Likelihood | Avoidance

 | Explicitly trigger user permission prompts during PWA initialization.

 |

---

## 6. Execution Instructions for Agent

1. **Deploy Microservices:** Execute the Python FastAPI REST endpoints (`graph_router.py` and `ocr_service.py`) inside lightweight containerized environments.


2. **Ingest Test Facility Map:** Populate the 3D spatial graph with node coordinates corresponding to the target TSI test facility building zone.


3. **Execute Integration Validation:** Verify that PWA client sensor updates continuously update the local coordinate state and trigger OCR recalibration upon room sign detection.
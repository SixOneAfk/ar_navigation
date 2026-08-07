from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import networkx as nx
from typing import List, Dict, Optional
import math

app = FastAPI(title="Nav_Ar 3D Graph Router", version="1.0.0")

# 3D Node Representation: id -> (x, y, floor, node_tag)
# Note: floor is used to calculate Z (floor * height_multiplier)
NODES_DB: Dict[str, Dict] = {
    "N101": {"x": 0.0, "y": 0.0, "floor": 1, "tag": "ROOM_101"},
    "N102": {"x": 12.5, "y": 0.0, "floor": 1, "tag": "HALLWAY_CORNER_1"},
    "N103": {"x": 12.5, "y": 15.0, "floor": 1, "tag": "ROOM_102"},
    "N104": {"x": 12.5, "y": 15.0, "floor": 2, "tag": "STAIRWELL_FL2"},
    "N201": {"x": 0.0, "y": 15.0, "floor": 2, "tag": "ROOM_201"},
}

FLOOR_HEIGHT = 4.0  # Meters per floor
FLOOR_CHANGE_PENALTY = 10.0  # Extra weight for using stairs/elevators

# Graph initialization
graph = nx.Graph()

def calculate_3d_distance(n1_id: str, n2_id: str) -> float:
    n1, n2 = NODES_DB[n1_id], NODES_DB[n2_id]
    dx = n1["x"] - n2["x"]
    dy = n1["y"] - n2["y"]
    dz = (n1["floor"] - n2["floor"]) * FLOOR_HEIGHT
    
    dist = math.sqrt(dx**2 + dy**2 + dz**2)
    
    # Add penalty for floor change
    if n1["floor"] != n2["floor"]:
        dist += FLOOR_CHANGE_PENALTY
        
    return dist

# Populate nodes
for node_id, data in NODES_DB.items():
    graph.add_node(node_id, **data)

# Define edges
edges = [
    ("N101", "N102"),
    ("N102", "N103"),
    ("N103", "N104"), # This represents a stair/elevator to floor 2
    ("N104", "N201"),
]

for u, v in edges:
    graph.add_edge(u, v, weight=calculate_3d_distance(u, v))

class PathRequest(BaseModel):
    start_node: str
    target_node: str

class PathResponse(BaseModel):
    path: List[str]
    total_distance: float
    nodes_detail: List[Dict]

@app.post("/api/v1/route", response_model=PathResponse)
def compute_route(request: PathRequest):
    """
    Computes the shortest path between two nodes using A* algorithm.
    """
    if request.start_node not in graph or request.target_node not in graph:
        raise HTTPException(
            status_code=404, 
            detail=f"Node {request.start_node if request.start_node not in graph else request.target_node} not found."
        )
    
    try:
        # A* heuristic: straight-line 3D distance
        def heuristic(u, v):
            return calculate_3d_distance(u, v)

        path = nx.astar_path(graph, request.start_node, request.target_node, heuristic=heuristic, weight="weight")
        total_dist = nx.path_weight(graph, path, weight="weight")
        nodes_detail = [{"id": n, **NODES_DB[n]} for n in path]
        
        return PathResponse(
            path=path,
            total_distance=round(total_dist, 2),
            nodes_detail=nodes_detail
        )
    except nx.NetworkXNoPath:
        raise HTTPException(status_code=400, detail="No valid path exists between specified nodes.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
def health_check():
    return {"status": "ok", "service": "graph-router"}

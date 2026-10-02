from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import networkx as nx
from pathlib import Path
from typing import List, Dict
import json
import math

app = FastAPI(title="Nav_Ar Building Graph Router", version="1.0.0")
NAVIGATION_JSON_PATH = Path(__file__).resolve().parents[1] / "apps" / "client" / "public" / "building_navigation.json"


def load_navigation_graph() -> nx.Graph:
    try:
        content = NAVIGATION_JSON_PATH.read_text(encoding="utf-8")
    except OSError as error:
        raise RuntimeError(f"Navigation JSON could not be read at {NAVIGATION_JSON_PATH}: {error}") from error

    try:
        navigation = json.loads(content.lstrip("\ufeff"))
    except json.JSONDecodeError as error:
        raise RuntimeError(f"Navigation JSON could not be parsed: {error}") from error

    if not isinstance(navigation, dict):
        raise RuntimeError("Navigation data must be a JSON object.")
    points = navigation.get("points")
    branches = navigation.get("branches")
    if not isinstance(points, list):
        raise RuntimeError("Navigation data is missing the points array.")
    if not isinstance(branches, list):
        raise RuntimeError("Navigation data is missing the branches array.")

    graph = nx.Graph()
    point_ids = set()
    for index, point in enumerate(points):
        if not isinstance(point, dict) or not isinstance(point.get("id"), str) or not point["id"]:
            raise RuntimeError(f"points[{index}].id must be a non-empty string.")
        if point["id"] in point_ids:
            raise RuntimeError(f"Duplicate navigation point ID: {point['id']}.")
        point_ids.add(point["id"])
        for coordinate in ("x", "y"):
            value = point.get(coordinate)
            if not isinstance(value, (int, float)) or not math.isfinite(value):
                raise RuntimeError(f"points[{index}].{coordinate} must be a finite number.")
        graph.add_node(point["id"], **point)

    branch_ids = set()
    for index, branch in enumerate(branches):
        if not isinstance(branch, dict) or not isinstance(branch.get("id"), str) or not branch["id"]:
            raise RuntimeError(f"branches[{index}].id must be a non-empty string.")
        if branch["id"] in branch_ids:
            raise RuntimeError(f"Duplicate navigation branch ID: {branch['id']}.")
        branch_ids.add(branch["id"])
        for endpoint in ("from", "to"):
            if branch.get(endpoint) not in point_ids:
                raise RuntimeError(
                    f"branches[{index}] ({branch['id']}) references nonexistent point "
                    f"{branch.get(endpoint)!r} in {endpoint}."
                )
        distance = branch.get("distance")
        if not isinstance(distance, (int, float)) or not math.isfinite(distance) or distance <= 0:
            raise RuntimeError(f"branches[{index}].distance must be a finite positive number.")
        graph.add_edge(branch["from"], branch["to"], weight=distance, branch_id=branch["id"])

    return graph


graph = load_navigation_graph()

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
        path = nx.shortest_path(graph, request.start_node, request.target_node, weight="weight", method="dijkstra")
        total_dist = nx.path_weight(graph, path, weight="weight")
        nodes_detail = [{"id": n, **graph.nodes[n]} for n in path]
        
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

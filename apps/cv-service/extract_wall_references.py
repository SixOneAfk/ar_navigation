import argparse
import json
import math
from pathlib import Path
import struct
from typing import Any

import numpy as np


_COMPONENTS = {
    5120: ("b", 1),
    5121: ("B", 1),
    5122: ("h", 2),
    5123: ("H", 2),
    5125: ("I", 4),
    5126: ("f", 4),
}
_COMPONENT_COUNTS = {
    "SCALAR": 1,
    "VEC2": 2,
    "VEC3": 3,
    "VEC4": 4,
}


def _load_glb(path: Path) -> tuple[dict[str, Any], bytes]:
    with path.open("rb") as handle:
        magic, version, total_length = struct.unpack("<4sII", handle.read(12))
        if magic != b"glTF" or version != 2:
            raise ValueError("Only binary glTF 2.0 files are supported")

        document: dict[str, Any] | None = None
        binary = b""
        while handle.tell() < total_length:
            chunk_length, chunk_type = struct.unpack("<II", handle.read(8))
            payload = handle.read(chunk_length)
            if chunk_type == 0x4E4F534A:
                document = json.loads(payload.decode("utf-8").rstrip("\x00 "))
            elif chunk_type == 0x004E4942:
                binary = payload

    if document is None or not binary:
        raise ValueError("GLB must contain JSON and binary chunks")
    return document, binary


def _read_accessor(
    document: dict[str, Any],
    binary: bytes,
    accessor_index: int,
) -> np.ndarray:
    accessor = document["accessors"][accessor_index]
    view = document["bufferViews"][accessor["bufferView"]]
    component_code, component_size = _COMPONENTS[accessor["componentType"]]
    component_count = _COMPONENT_COUNTS[accessor["type"]]
    offset = view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
    stride = view.get("byteStride", component_size * component_count)
    format_string = "<" + (component_code * component_count)
    values = [
        struct.unpack_from(
            format_string,
            binary,
            offset + (row * stride),
        )
        for row in range(accessor["count"])
    ]
    return np.asarray(values)


def _quaternion_matrix(rotation: list[float]) -> np.ndarray:
    x, y, z, w = rotation
    length = math.sqrt((x * x) + (y * y) + (z * z) + (w * w))
    if length <= 1e-12:
        return np.identity(4)
    x, y, z, w = x / length, y / length, z / length, w / length
    return np.asarray(
        [
            [
                1 - (2 * ((y * y) + (z * z))),
                2 * ((x * y) - (z * w)),
                2 * ((x * z) + (y * w)),
                0,
            ],
            [
                2 * ((x * y) + (z * w)),
                1 - (2 * ((x * x) + (z * z))),
                2 * ((y * z) - (x * w)),
                0,
            ],
            [
                2 * ((x * z) - (y * w)),
                2 * ((y * z) + (x * w)),
                1 - (2 * ((x * x) + (y * y))),
                0,
            ],
            [0, 0, 0, 1],
        ],
        dtype=np.float64,
    )


def _local_matrix(node: dict[str, Any]) -> np.ndarray:
    if "matrix" in node:
        return np.asarray(node["matrix"], dtype=np.float64).reshape(4, 4).T

    translation = np.identity(4)
    translation[:3, 3] = np.asarray(
        node.get("translation", [0.0, 0.0, 0.0]),
        dtype=np.float64,
    )
    scale = np.identity(4)
    scale_values = node.get("scale", [1.0, 1.0, 1.0])
    scale[0, 0], scale[1, 1], scale[2, 2] = scale_values
    rotation = _quaternion_matrix(
        node.get("rotation", [0.0, 0.0, 0.0, 1.0])
    )
    return translation @ rotation @ scale


def _world_matrices(document: dict[str, Any]) -> dict[int, np.ndarray]:
    scene_index = document.get("scene", 0)
    roots = document["scenes"][scene_index].get("nodes", [])
    matrices: dict[int, np.ndarray] = {}
    stack = [
        (node_index, np.identity(4))
        for node_index in roots
    ]
    while stack:
        node_index, parent_matrix = stack.pop()
        node = document["nodes"][node_index]
        world_matrix = parent_matrix @ _local_matrix(node)
        matrices[node_index] = world_matrix
        stack.extend(
            (child_index, world_matrix)
            for child_index in node.get("children", [])
        )
    return matrices


def _largest_mesh(
    document: dict[str, Any],
    binary: bytes,
) -> tuple[str, np.ndarray, np.ndarray]:
    matrices = _world_matrices(document)
    best: tuple[int, str, np.ndarray, np.ndarray] | None = None

    for node_index, node in enumerate(document.get("nodes", [])):
        mesh_index = node.get("mesh")
        if mesh_index is None or node_index not in matrices:
            continue
        mesh = document["meshes"][mesh_index]
        for primitive in mesh.get("primitives", []):
            position_index = primitive.get("attributes", {}).get("POSITION")
            if position_index is None:
                continue
            positions = _read_accessor(
                document,
                binary,
                position_index,
            ).astype(np.float64)
            count = len(positions)
            if best is not None and count <= best[0]:
                continue

            homogeneous = np.column_stack(
                (positions, np.ones(count, dtype=np.float64))
            )
            transformed = (
                matrices[node_index] @ homogeneous.T
            ).T[:, :3]
            index_accessor = primitive.get("indices")
            if index_accessor is None:
                indices = np.arange(count, dtype=np.int64)
            else:
                indices = _read_accessor(
                    document,
                    binary,
                    index_accessor,
                ).reshape(-1).astype(np.int64)
            name = node.get("name") or mesh.get("name") or f"mesh-{mesh_index}"
            best = (count, name, transformed, indices)

    if best is None:
        raise ValueError("GLB does not contain triangle mesh geometry")
    return best[1], best[2], best[3]


def _find_components(
    triangles: np.ndarray,
    normals: np.ndarray,
    areas: np.ndarray,
) -> list[dict[str, Any]]:
    plane_groups: dict[tuple[str, float], list[tuple[np.ndarray, float]]] = {}
    for triangle, normal, area in zip(triangles, normals, areas):
        if area < 1e-5 or abs(float(normal[1])) > 0.05:
            continue
        if abs(float(normal[0])) >= 0.98:
            axis = "x"
            coordinate = float(triangle[:, 0].mean())
        elif abs(float(normal[2])) >= 0.98:
            axis = "z"
            coordinate = float(triangle[:, 2].mean())
        else:
            continue
        plane_groups.setdefault(
            (axis, round(coordinate, 3)),
            [],
        ).append((triangle, float(area)))

    walls: list[dict[str, Any]] = []
    for (axis, coordinate), items in plane_groups.items():
        parent = list(range(len(items)))

        def find(value: int) -> int:
            while parent[value] != value:
                parent[value] = parent[parent[value]]
                value = parent[value]
            return value

        def union(first: int, second: int) -> None:
            first_root = find(first)
            second_root = find(second)
            if first_root != second_root:
                parent[second_root] = first_root

        edges: dict[
            tuple[tuple[float, ...], tuple[float, ...]],
            int,
        ] = {}
        for item_index, (triangle, _area) in enumerate(items):
            vertices = [
                tuple(float(value) for value in np.round(vertex, 4))
                for vertex in triangle
            ]
            for first, second in ((0, 1), (1, 2), (2, 0)):
                edge = tuple(sorted((vertices[first], vertices[second])))
                previous = edges.get(edge)
                if previous is None:
                    edges[edge] = item_index
                else:
                    union(item_index, previous)

        component_items: dict[int, list[tuple[np.ndarray, float]]] = {}
        for item_index, item in enumerate(items):
            component_items.setdefault(find(item_index), []).append(item)

        for connected in component_items.values():
            points = np.concatenate([item[0] for item in connected])
            minimum = points.min(axis=0)
            maximum = points.max(axis=0)
            width = (
                maximum[2] - minimum[2]
                if axis == "x"
                else maximum[0] - minimum[0]
            )
            height = maximum[1] - minimum[1]
            area = sum(item[1] for item in connected)
            if width < 1.5 or height < 2.4 or area < 1.0:
                continue
            walls.append(
                {
                    "axis": axis,
                    "coordinate": round(coordinate, 4),
                    "bounds": {
                        "min": {
                            "x": round(float(minimum[0]), 4),
                            "y": round(float(minimum[1]), 4),
                            "z": round(float(minimum[2]), 4),
                        },
                        "max": {
                            "x": round(float(maximum[0]), 4),
                            "y": round(float(maximum[1]), 4),
                            "z": round(float(maximum[2]), 4),
                        },
                    },
                    "width": round(float(width), 4),
                    "height": round(float(height), 4),
                    "surface_area": round(float(area), 4),
                }
            )

    walls.sort(
        key=lambda wall: (
            wall["axis"],
            wall["coordinate"],
            wall["bounds"]["min"]["x"],
            wall["bounds"]["min"]["z"],
        )
    )
    for index, wall in enumerate(walls, start=1):
        wall["id"] = f"wall-{index:04d}"
    return walls


def extract_wall_references(model_path: Path) -> dict[str, Any]:
    document, binary = _load_glb(model_path)
    mesh_name, positions, indices = _largest_mesh(document, binary)
    triangles = positions[indices.reshape(-1, 3)]
    crosses = np.cross(
        triangles[:, 1] - triangles[:, 0],
        triangles[:, 2] - triangles[:, 0],
    )
    magnitudes = np.linalg.norm(crosses, axis=1)
    normals = crosses / np.maximum(magnitudes[:, None], 1e-12)
    walls = _find_components(triangles, normals, magnitudes * 0.5)
    if not walls:
        raise ValueError("No axis-aligned wall surfaces were found")

    return {
        "source_model": model_path.name,
        "source_mesh": mesh_name,
        "coordinate_system": "gltf_scene_y_up",
        "wall_count": len(walls),
        "walls": walls,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("model", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()

    catalog = extract_wall_references(args.model)
    args.output.write_text(
        json.dumps(catalog, indent=2) + "\n",
        encoding="utf-8",
    )
    print(
        f"Wrote {catalog['wall_count']} wall references to {args.output}"
    )


if __name__ == "__main__":
    main()

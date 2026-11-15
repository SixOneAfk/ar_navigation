import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import HTTPException

from backend import graph_router


class GraphRouterTests(unittest.TestCase):
    def setUp(self):
        data = {
            "points": [
                {"id": "A", "x": 0, "y": 0},
                {"id": "B", "x": 1, "y": 0},
                {"id": "C", "x": 0, "y": 10},
                {"id": "D", "x": 1, "y": 10},
                {"id": "isolated", "x": 2, "y": 1},
            ],
            "branches": [
                {"id": "AB", "from": "A", "to": "B", "distance": 5},
                {"id": "AC", "from": "A", "to": "C", "distance": 0.1},
                {"id": "CD", "from": "C", "to": "D", "distance": 0.1},
                {"id": "DB", "from": "D", "to": "B", "distance": 0.1},
                {"id": "diagonal", "from": "B", "to": "isolated", "distance": 0.01},
            ],
        }
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "navigation.json"
            path.write_text(json.dumps(data), encoding="utf-8")
            with patch.object(graph_router, "NAVIGATION_JSON_PATH", path):
                self.graph = graph_router.load_navigation_graph()

    def test_astar_uses_weighted_cardinal_branches(self):
        with patch.object(graph_router, "graph", self.graph), patch.object(
            graph_router.nx, "astar_path", wraps=graph_router.nx.astar_path
        ) as astar:
            result = graph_router.compute_route(
                graph_router.PathRequest(start_node="A", target_node="B")
            )
        astar.assert_called_once()
        self.assertEqual(result.path, ["A", "C", "D", "B"])
        self.assertEqual(result.total_distance, 0.3)
        self.assertEqual([node["id"] for node in result.nodes_detail], result.path)

    def test_rejects_diagonal_and_disconnected_routes(self):
        self.assertFalse(self.graph.has_edge("B", "isolated"))
        with patch.object(graph_router, "graph", self.graph):
            with self.assertRaises(HTTPException) as error:
                graph_router.compute_route(
                    graph_router.PathRequest(start_node="A", target_node="isolated")
                )
        self.assertEqual(error.exception.status_code, 400)


if __name__ == "__main__":
    unittest.main()

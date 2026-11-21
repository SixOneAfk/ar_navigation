import json
import base64
import tempfile
import unittest
from pathlib import Path

import cv2
import numpy as np

from localization_matching import LocalizationMatcher, MatchRequest
import main
from unittest.mock import patch


def image(seed: int) -> np.ndarray:
    random = np.random.default_rng(seed)
    result = np.full((480, 640, 3), 200, np.uint8)
    for _ in range(150):
        x, y = random.integers([15, 15], [625, 465])
        cv2.circle(result, (int(x), int(y)), int(random.integers(3, 12)), (20, 40, 100), -1)
    return result


class LocalizationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        root = Path(self.directory.name)
        self.manifest = {
            "searchRadiusMeters": 15, "updateThresholdMeters": 1,
            "references": [
                {"id": "a", "image": "a.jpg", "pointId": "p1"},
                {"id": "b", "image": "b.jpg", "pointId": "p2", "facingTarget": "p1"},
            ],
        }
        (root / "catalog.json").write_text(json.dumps(self.manifest))
        cv2.imwrite(str(root / "a.jpg"), image(1))
        cv2.imwrite(str(root / "b.jpg"), image(2))
        self.matcher = LocalizationMatcher(root)
        self.revision = self.matcher.catalog()[1]

    def match(self, frame: np.ndarray, ids: list[str]):
        return self.matcher.match(frame, MatchRequest(image_payload="unused", reference_ids=ids, revision=self.revision))

    def test_only_active_references_are_loaded_and_matched(self) -> None:
        self.assertEqual(self.match(image(1), ["a"]).reference_id, "a")
        self.assertEqual(len(self.matcher.cache), 1)
        self.assertEqual(self.match(image(1), ["b"]).status, "no_match")
        self.assertEqual(self.match(image(2), ["b"]).point_id, "p2")
        self.assertEqual(len(self.matcher.cache), 2)

    def test_rejects_unknown_ids_and_changed_catalog(self) -> None:
        with self.assertRaisesRegex(ValueError, "Unknown localization"):
            self.match(image(1), ["missing"])
        self.matcher.root.joinpath("catalog.json").write_text(json.dumps({**self.manifest, "searchRadiusMeters": 12}))
        self.assertEqual(self.match(image(1), ["a"]).status, "references_changed")

    def test_rejects_reference_path_escape(self) -> None:
        self.manifest["references"][0]["image"] = "../outside.jpg"
        self.matcher.root.joinpath("catalog.json").write_text(json.dumps(self.manifest))
        with self.assertRaisesRegex(ValueError, "Invalid image path"):
            self.matcher.catalog()

    def test_multiple_images_for_the_same_pose_are_not_ambiguous(self) -> None:
        self.manifest["references"][1]["pointId"] = "p1"
        self.manifest["references"][1].pop("facingTarget")
        cv2.imwrite(str(self.matcher.root / "b.jpg"), image(1))
        self.matcher.root.joinpath("catalog.json").write_text(json.dumps(self.manifest))
        self.revision = self.matcher.catalog()[1]
        self.assertEqual(self.match(image(1), ["a", "b"]).status, "matched")

    def test_ambiguous_different_poses_are_rejected(self) -> None:
        cv2.imwrite(str(self.matcher.root / "b.jpg"), image(1))
        self.assertEqual(self.match(image(1), ["a", "b"]).status, "no_match")

    def test_endpoint_returns_match_for_active_reference(self) -> None:
        ok, encoded = cv2.imencode(".jpg", image(1))
        self.assertTrue(ok)
        payload = MatchRequest(
            image_payload=base64.b64encode(encoded).decode(),
            reference_ids=["a"], revision=self.revision,
        )
        with patch.object(main, "localization_matcher", self.matcher):
            result = main.match_localization(payload)
        self.assertEqual((result.status, result.reference_id, result.point_id), ("matched", "a", "p1"))
        self.assertGreaterEqual(result.confidence, 0.6)


if __name__ == "__main__":
    unittest.main()

import json
import base64
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import cv2
import numpy as np

from route_photo_matching import (
    Features, PhotoRouteMatcher, Reference, clip_to_frame, extract_features,
    extract_reference_features, match_reference,
    resize_for_features,
)
from fastapi import HTTPException
from pydantic import ValidationError
import main


def textured_image(seed: int) -> np.ndarray:
    rng = np.random.default_rng(seed)
    image = np.full((480, 640, 3), 215, dtype=np.uint8)
    for _ in range(160):
        x, y = rng.integers([20, 20], [620, 460])
        radius = int(rng.integers(3, 13))
        color = tuple(int(value) for value in rng.integers(20, 170, size=3))
        cv2.circle(image, (int(x), int(y)), radius, color, -1)
    cv2.putText(image, f'VIEW {seed}', (120, 250), cv2.FONT_HERSHEY_SIMPLEX, 2, (10, 10, 10), 4)
    return image


class PhotoRouteMatcherTests(unittest.TestCase):
    def setUp(self) -> None:
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        self.manifest = {
            "id": "test", "name": "Test route",
            "points": [{"id": f"point-{index:02d}", "name": f"Point {index}"} for index in range(1, 6)],
        }
        (self.root / "route.json").write_text(json.dumps(self.manifest))
        for index in range(1, 6):
            point = self.root / f"point-{index:02d}"
            point.mkdir()
            self.assertTrue(cv2.imwrite(str(point / "front.jpg"), textured_image(index)))
        self.matcher = PhotoRouteMatcher(self.root)

    def test_loads_five_points_and_caches_reference_features(self) -> None:
        with patch("route_photo_matching.extract_features", wraps=__import__('route_photo_matching').extract_features) as extract:
            first = self.matcher.catalog()
            second = self.matcher.catalog()
        self.assertTrue(first["ready"])
        self.assertEqual(len(first["points"]), 5)
        self.assertEqual(first["revision"], second["revision"])
        self.assertEqual(extract.call_count, 5)

    def test_recognizes_expected_view_with_perspective_and_lighting_change(self) -> None:
        catalog = self.matcher.catalog()
        transform = cv2.getPerspectiveTransform(
            np.float32([[0, 0], [639, 0], [639, 479], [0, 479]]),
            np.float32([[40, 30], [590, 15], [615, 450], [20, 465]]),
        )
        image = cv2.warpPerspective(textured_image(2), transform, (640, 480), borderValue=(215, 215, 215))
        image = cv2.convertScaleAbs(image, alpha=0.7, beta=15)
        result = self.matcher.analyze(image, "point-02", catalog["revision"])

        self.assertEqual(result["status"], "matched")
        self.assertTrue(result["expected_matched"])
        self.assertEqual(result["recognized_point_id"], "point-02")
        self.assertGreaterEqual(result["candidate"]["inliers"], 12)
        self.assertGreaterEqual(result["candidate"]["score"], 0.6)
        self.assertTrue(result["diagnostic_only"])

    def test_recognizes_all_five_decoded_jpegs_including_coincident_frame_edges(self) -> None:
        revision = self.matcher.catalog()["revision"]
        for index in range(1, 6):
            with self.subTest(point=index):
                _, encoded = cv2.imencode('.jpg', textured_image(index))
                image = cv2.imdecode(encoded, cv2.IMREAD_COLOR)
                result = self.matcher.analyze(image, f"point-{index:02d}", revision)
                self.assertEqual(result["recognized_point_id"], f"point-{index:02d}")
                self.assertTrue(result["expected_matched"])
                self.assertGreater(result["candidate"]["visible_fraction"], 0.95)

    def test_reports_out_of_order_view_without_confirming_target(self) -> None:
        revision = self.matcher.catalog()["revision"]
        result = self.matcher.analyze(textured_image(4), "point-02", revision)
        self.assertEqual(result["recognized_point_id"], "point-04")
        self.assertFalse(result["expected_matched"])

    def test_rejects_duplicate_views_assigned_to_different_points(self) -> None:
        cv2.imwrite(str(self.root / "point-03" / "duplicate.jpg"), textured_image(2))
        revision = self.matcher.catalog()["revision"]
        result = self.matcher.analyze(textured_image(2), "point-02", revision)
        self.assertEqual(result["status"], "ambiguous")
        self.assertIsNone(result["recognized_point_id"])
        self.assertFalse(result["expected_matched"])

    def test_similar_surroundings_with_different_small_signs_are_ambiguous(self) -> None:
        for index in (2, 3):
            image = textured_image(2)
            cv2.rectangle(image, (120, 190), (450, 260), (215, 215, 215), -1)
            cv2.putText(image, f'ROOM 10{index}', (170, 230), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (10, 10, 10), 2)
            cv2.imwrite(str(self.root / f"point-{index:02d}" / "front.jpg"), image)
        query = cv2.imread(str(self.root / "point-02" / "front.jpg"))
        revision = self.matcher.catalog()["revision"]
        result = self.matcher.analyze(query, "point-02", revision)
        self.assertEqual(result["status"], "ambiguous")
        self.assertFalse(result["expected_matched"])

    def test_blank_and_unseen_views_are_not_matches(self) -> None:
        revision = self.matcher.catalog()["revision"]
        blank = self.matcher.analyze(np.full((480, 640, 3), 200, np.uint8), "point-01", revision)
        unrelated = self.matcher.analyze(textured_image(99), "point-01", revision)
        self.assertEqual(blank["status"], "low_detail")
        self.assertIsNone(unrelated["recognized_point_id"])
        self.assertIsNone(blank["attempt"])
        self.assertEqual(len(unrelated["attempts"]), 5)
        self.assertTrue(all(attempt["rejection_reason"] for attempt in unrelated["attempts"]))

    def test_reports_descriptor_matches_before_geometry_is_rejected(self) -> None:
        self.matcher.catalog()
        reference = self.matcher._references[0]
        frame = Features(np.float32([[index * 10, index * 8] for index in range(6)]), None, 640, 480)
        matcher = unittest.mock.Mock()
        matcher.knnMatch.return_value = [
            [cv2.DMatch(index, index, 0.1), cv2.DMatch(index, index + 1, 1.0)]
            for index in range(5)
        ]
        attempt = {}
        candidate = match_reference(reference, frame, matcher, attempt)
        self.assertIsNone(candidate)
        self.assertEqual(attempt["point_id"], "point-01")
        self.assertEqual(attempt["good_matches"], 5)
        self.assertEqual(attempt["inliers"], 0)
        self.assertEqual(attempt["minimum_inliers"], 12)
        self.assertEqual(attempt["rejection_reason"], "insufficient_matches")

    def test_reports_geometry_failure_without_fabricating_a_score(self) -> None:
        revision = self.matcher.catalog()["revision"]
        with patch("route_photo_matching.cv2.findHomography", return_value=(None, None)):
            result = self.matcher.analyze(textured_image(1), "point-01", revision)
        self.assertEqual(result["status"], "no_match")
        self.assertIsNone(result["candidate"])
        self.assertEqual(result["attempt"]["point_id"], "point-01")
        self.assertGreaterEqual(result["attempt"]["good_matches"], 12)
        self.assertEqual(result["attempt"]["rejection_reason"], "unstable_geometry")
        self.assertNotIn("score", result["attempt"])

    def test_duplicate_orientations_of_one_live_feature_cannot_inflate_match_counts(self) -> None:
        self.matcher.catalog()
        reference = self.matcher._references[0]
        frame = Features(np.full((20, 2), 100, np.float32), None, 640, 480)
        matcher = unittest.mock.Mock()
        matcher.knnMatch.return_value = [
            [cv2.DMatch(index, index, 0.1), cv2.DMatch(index, (index + 1) % 20, 1.0)]
            for index in range(20)
        ]
        attempt = {}
        self.assertIsNone(match_reference(reference, frame, matcher, attempt))
        self.assertEqual(attempt["good_matches"], 1)
        self.assertEqual(attempt["rejection_reason"], "insufficient_matches")

    def test_accepts_a_lead_exactly_at_the_configured_threshold(self) -> None:
        revision = self.matcher.catalog()["revision"]

        def candidate(reference, _frame, _matcher, attempt):
            attempt.update(
                point_id=reference.point_id, reference_file=reference.filename,
                reference_features=100, good_matches=40, inliers=30,
                minimum_inliers=12, rejection_reason=None,
            )
            score = {"point-01": 0.7, "point-02": 0.6}.get(reference.point_id)
            return {"point_id": reference.point_id, "score": score, "visible_fraction": 0.8} if score else None

        with patch("route_photo_matching.match_reference", side_effect=candidate):
            result = self.matcher.analyze(textured_image(1), "point-01", revision, minimum_margin=0.1)
        self.assertEqual(result["margin"], 0.1)
        self.assertEqual(result["status"], "matched")
        self.assertTrue(result["expected_matched"])

    def test_recognizes_a_center_cropped_portrait_reference_as_a_camera_jpeg(self) -> None:
        image = cv2.resize(textured_image(1), (480, 640))
        cv2.imwrite(str(self.root / "point-01" / "portrait.jpg"), image)
        revision = self.matcher.catalog()["revision"]
        frame = cv2.resize(image[140:500, :], (640, 480))
        _, encoded = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
        result = self.matcher.analyze(cv2.imdecode(encoded, cv2.IMREAD_COLOR), "point-01", revision)
        self.assertEqual(result["status"], "matched")
        self.assertEqual(result["recognized_point_id"], "point-01")
        self.assertGreater(result["candidate"]["score"], 0.6)

    def test_multiple_photos_of_one_point_do_not_create_cross_point_ambiguity(self) -> None:
        cv2.imwrite(str(self.root / "point-02" / "other.jpg"), textured_image(22))
        revision = self.matcher.catalog()["revision"]
        result = self.matcher.analyze(textured_image(22), "point-02", revision)
        self.assertEqual(result["recognized_point_id"], "point-02")
        self.assertEqual(result["candidate"]["reference_file"], "other.jpg")

    def test_recognizes_a_small_part_of_a_wide_reference_with_brightness_change(self) -> None:
        wide = np.vstack((
            np.hstack((textured_image(21), textured_image(22))),
            np.hstack((textured_image(23), textured_image(24))),
        ))
        cv2.imwrite(str(self.root / "point-01" / "wide.jpg"), wide)
        revision = self.matcher.catalog()["revision"]
        for left, top in ((480, 120), (80, 420)):
            with self.subTest(left=left, top=top):
                frame = cv2.resize(wide[top:top + 300, left:left + 400], (640, 480))
                frame = cv2.convertScaleAbs(frame, alpha=0.75, beta=15)
                _, encoded = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
                result = self.matcher.analyze(cv2.imdecode(encoded, cv2.IMREAD_COLOR), "point-01", revision)
                self.assertEqual(result["recognized_point_id"], "point-01")
                self.assertLess(result["candidate"]["reference_visible_fraction"], 0.15)
                self.assertGreater(result["candidate"]["overlap_coverage"], 0.06)

    def test_reference_detail_views_are_cached_and_not_recomputed_for_live_frames(self) -> None:
        large = cv2.resize(textured_image(21), (1280, 960))
        cv2.imwrite(str(self.root / "point-01" / "wide.jpg"), large)
        with patch("route_photo_matching.extract_reference_features", wraps=extract_reference_features) as extract:
            revision = self.matcher.catalog()["revision"]
            self.assertEqual(extract.call_count, 6)
            self.matcher.analyze(large[240:720, 320:960], "point-01", revision)
            self.matcher.analyze(large[240:720, 320:960], "point-01", revision)
            self.assertEqual(extract.call_count, 6)
        reference = next(ref for ref in self.matcher._references if ref.filename == "wide.jpg")
        self.assertGreater(len(reference.features.points), 1000)
        self.assertTrue(np.all(reference.features.points >= 0))
        self.assertTrue(np.all(reference.features.points[:, 0] < reference.features.width))
        self.assertTrue(np.all(reference.features.points[:, 1] < reference.features.height))

    def test_a_tiny_repeated_detail_does_not_confirm_a_view(self) -> None:
        revision = self.matcher.catalog()["revision"]
        query = textured_image(99)
        query[180:240, 250:330] = textured_image(1)[180:240, 250:330]
        result = self.matcher.analyze(query, "point-01", revision)
        self.assertFalse(result["expected_matched"])
        self.assertIsNone(result["recognized_point_id"])

    def test_changed_references_invalidate_active_revision(self) -> None:
        revision = self.matcher.catalog()["revision"]
        cv2.imwrite(str(self.root / "point-01" / "new.jpg"), textured_image(11))
        result = self.matcher.analyze(textured_image(2), "point-02", revision)
        self.assertEqual(result["status"], "references_changed")
        self.assertFalse(result["expected_matched"])

    def test_empty_point_prevents_route_start(self) -> None:
        (self.root / "point-03" / "front.jpg").unlink()
        catalog = self.matcher.catalog()
        self.assertFalse(catalog["ready"])
        result = self.matcher.analyze(textured_image(1), "point-01", catalog["revision"])
        self.assertEqual(result["status"], "not_ready")

    def test_disabled_fifth_point_needs_no_photos_and_is_not_analyzed(self) -> None:
        self.manifest["points"][4]["enabled"] = False
        (self.root / "route.json").write_text(json.dumps(self.manifest))
        (self.root / "point-05" / "front.jpg").unlink()
        catalog = self.matcher.catalog()
        self.assertTrue(catalog["ready"])
        self.assertEqual([point["id"] for point in catalog["points"]], [f"point-0{index}" for index in range(1, 5)])
        self.assertEqual(catalog["disabled_points"], [{"id": "point-05", "name": "Point 5"}])
        self.assertTrue(all(ref.point_id != "point-05" for ref in self.matcher._references))
        result = self.matcher.analyze(textured_image(4), "point-04", catalog["revision"])
        self.assertEqual(result["recognized_point_id"], "point-04")
        self.assertEqual(len(result["attempts"]), 4)
        with self.assertRaisesRegex(ValueError, "Unknown expected point"):
            self.matcher.analyze(textured_image(5), "point-05", catalog["revision"])

    def test_reenabling_fifth_point_keeps_its_photos_and_invalidates_active_revision(self) -> None:
        self.manifest["points"][4]["enabled"] = False
        (self.root / "route.json").write_text(json.dumps(self.manifest))
        revision = self.matcher.catalog()["revision"]
        self.manifest["points"][4]["enabled"] = True
        (self.root / "route.json").write_text(json.dumps(self.manifest))
        result = self.matcher.analyze(textured_image(4), "point-04", revision)
        self.assertEqual(result["status"], "references_changed")
        catalog = self.matcher.catalog()
        self.assertEqual(len(catalog["points"]), 5)
        self.assertEqual(catalog["disabled_points"], [])
        self.assertEqual(catalog["points"][4]["files"], ["front.jpg"])

    def test_rejects_nonboolean_flags_and_routes_without_enabled_points(self) -> None:
        self.manifest["points"][4]["enabled"] = "false"
        (self.root / "route.json").write_text(json.dumps(self.manifest))
        with self.assertRaisesRegex(ValueError, "booleans"):
            self.matcher.catalog()
        for point in self.manifest["points"]:
            point["enabled"] = False
        (self.root / "route.json").write_text(json.dumps(self.manifest))
        with self.assertRaisesRegex(ValueError, "at least one enabled point"):
            self.matcher.catalog()

    def test_accepts_four_configured_points_without_a_fifth_entry(self) -> None:
        self.manifest["points"] = self.manifest["points"][:4]
        (self.root / "route.json").write_text(json.dumps(self.manifest))
        catalog = self.matcher.catalog()
        self.assertTrue(catalog["ready"])
        self.assertEqual(len(catalog["points"]), 4)

    def test_api_recognizes_a_full_portrait_jpeg_without_losing_its_top_or_bottom(self) -> None:
        portrait = cv2.resize(textured_image(21), (480, 640))
        cv2.imwrite(str(self.root / "point-01" / "front.jpg"), portrait)
        revision = self.matcher.catalog()["revision"]
        _, encoded = cv2.imencode('.jpg', portrait, [cv2.IMWRITE_JPEG_QUALITY, 80])
        with patch.object(main, "photo_route_matcher", self.matcher):
            result = main.match_photo_route(main.PhotoRouteRequest(
                image_payload=base64.b64encode(encoded).decode(),
                expected_point_id="point-01", revision=revision,
            ))
        self.assertEqual(result["recognized_point_id"], "point-01")
        self.assertTrue(result["expected_matched"])
        self.assertGreater(result["candidate"]["visible_fraction"], 0.95)

    def test_bad_image_is_reported_and_not_used(self) -> None:
        (self.root / "point-01" / "broken.jpg").write_bytes(b"invalid")
        catalog = self.matcher.catalog()
        self.assertTrue(catalog["ready"])
        self.assertEqual(catalog["points"][0]["usable_reference_count"], 1)
        self.assertTrue(any("broken.jpg" in warning for warning in catalog["warnings"]))

    def test_busy_analyzer_does_not_queue_work(self) -> None:
        self.matcher._lock.acquire()
        try:
            result = self.matcher.analyze(textured_image(1), "point-01", "revision")
        finally:
            self.matcher._lock.release()
        self.assertEqual(result["status"], "busy")

    def test_rejects_path_traversal_and_duplicate_ids(self) -> None:
        for invalid in ("../outside", "point-02"):
            self.manifest["points"][0]["id"] = invalid
            (self.root / "route.json").write_text(json.dumps(self.manifest))
            with self.assertRaises(ValueError):
                self.matcher.catalog()


class PhotoRouteEndpointTests(unittest.TestCase):
    def test_rejects_invalid_settings_and_path_ids(self) -> None:
        valid = {"image_payload": "jpeg", "expected_point_id": "point-01", "revision": "abc"}
        for settings in ({"minimum_score": 0}, {"minimum_margin": 0}, {"minimum_visible_fraction": 1.1}, {"expected_point_id": "../bad"}):
            with self.assertRaises(ValidationError):
                main.PhotoRouteRequest(**{**valid, **settings})

    def test_rejects_empty_encoded_image_without_a_server_error(self) -> None:
        with self.assertRaises(HTTPException) as context:
            main.match_photo_route(main.PhotoRouteRequest(
                image_payload="data:image/jpeg;base64,", expected_point_id="point-01", revision="abc",
            ))
        self.assertEqual(context.exception.status_code, 400)

    @patch.object(main.photo_route_matcher, "catalog", side_effect=ValueError("Invalid route configuration"))
    def test_reports_bad_configuration(self, _catalog_mock: object) -> None:
        with self.assertRaises(HTTPException) as context:
            main.get_photo_route(reload=False)
        self.assertEqual(context.exception.status_code, 400)

    @patch.object(main.photo_route_matcher, "analyze")
    def test_endpoint_forwards_thresholds_without_position_corrections(self, analyze_mock: object) -> None:
        image = textured_image(1)
        _, encoded = cv2.imencode('.jpg', image)
        analyze_mock.return_value = {"status": "no_match", "diagnostic_only": True}
        response = main.match_photo_route(main.PhotoRouteRequest(
            image_payload=base64.b64encode(encoded.tobytes()).decode(), expected_point_id="point-01",
            revision="abc", minimum_score=0.7, minimum_margin=0.15, minimum_visible_fraction=0.2,
        ))
        self.assertTrue(response["diagnostic_only"])
        self.assertEqual(analyze_mock.call_args.args[1:], ("point-01", "abc", 0.7, 0.15, 0.2))


class FrameClippingTests(unittest.TestCase):
    def test_preserves_area_with_nearly_coincident_frame_edges(self) -> None:
        points = np.float32([[8e-14, -8e-15], [639, 1e-13], [639, 479], [2e-14, 479]])
        clipped = clip_to_frame(points, 640, 480)
        self.assertAlmostEqual(cv2.contourArea(clipped), 639 * 479, delta=0.1)

    def test_clips_partial_views_and_rejects_outside_views(self) -> None:
        partial = clip_to_frame(np.float32([[-100, 100], [100, 100], [100, 300], [-100, 300]]), 640, 480)
        self.assertAlmostEqual(cv2.contourArea(partial), 20000, delta=0.1)
        outside = clip_to_frame(np.float32([[-100, -100], [-20, -100], [-20, -20], [-100, -20]]), 640, 480)
        self.assertEqual(len(outside), 0)


class PortraitFeatureTests(unittest.TestCase):
    def test_preserves_full_portrait_and_landscape_frames_with_equal_pixel_budgets(self) -> None:
        for shape, expected in (((1920, 1080, 3), (640, 360)), ((960, 1280, 3), (480, 640))):
            with self.subTest(shape=shape):
                image = np.full(shape, 180, np.uint8)
                image[:24] = (10, 20, 30)
                image[-24:] = (40, 50, 60)
                resized = resize_for_features(image, 640)
                self.assertEqual(resized.shape[:2], expected)
                self.assertEqual(resized[0, 0].tolist(), [10, 20, 30])
                self.assertEqual(resized[-1, -1].tolist(), [40, 50, 60])
                self.assertLessEqual(resized.shape[0] * resized.shape[1], 640 * 480)

    def test_keeps_a_480_by_640_camera_frame_at_full_resolution(self) -> None:
        portrait = cv2.resize(textured_image(21), (480, 640))
        features = extract_features(portrait)
        self.assertEqual((features.width, features.height), (480, 640))

    def test_prepares_portrait_reference_tiles_without_stretching(self) -> None:
        portrait = cv2.resize(textured_image(21), (960, 1280))
        features = extract_reference_features(portrait)
        self.assertEqual((features.width, features.height), (960, 1280))
        self.assertGreater(len(features.points), 1000)
        self.assertTrue(np.all(features.points[:, 0] < 960))
        self.assertTrue(np.all(features.points[:, 1] < 1280))


class PartialOverlapGeometryTests(unittest.TestCase):
    def match_crop(self, mirrored=False, concentrated=False):
        destination = np.float32([
            [x, y] for y in np.linspace(60, 420, 5) for x in np.linspace(80, 560, 6)
        ])
        if concentrated:
            destination = destination * 0.05 + np.float32([300, 220])
        source = destination / 4 + np.float32([220, 160])
        if mirrored:
            source[:, 0] = 640 - source[:, 0]
        descriptors = np.ones((len(source), 128), np.float32)
        reference = Reference("point-01", "wide.jpg", Features(source, descriptors, 640, 480))
        frame = Features(destination, descriptors, 640, 480)
        matcher = unittest.mock.Mock()
        matcher.knnMatch.return_value = [
            [cv2.DMatch(index, index, 0.1), cv2.DMatch(index, (index + 1) % len(source), 1.0)]
            for index in range(len(source))
        ]
        attempt = {}
        return match_reference(reference, frame, matcher, attempt), attempt

    def test_accepts_strong_geometry_when_only_one_sixteenth_of_the_reference_is_visible(self):
        candidate, attempt = self.match_crop()
        self.assertIsNotNone(candidate)
        self.assertIsNone(attempt["rejection_reason"])
        self.assertEqual(candidate["inliers"], 30)
        self.assertLess(candidate["reference_visible_fraction"], 0.063)
        self.assertGreater(candidate["overlap_coverage"], 0.5)
        self.assertGreater(candidate["visible_fraction"], 0.95)

    def test_rejects_mirrored_geometry(self):
        candidate, attempt = self.match_crop(mirrored=True)
        self.assertIsNone(candidate)
        self.assertEqual(attempt["rejection_reason"], "invalid_projection")

    def test_rejects_matches_concentrated_in_a_tiny_part_of_the_live_frame(self):
        candidate, attempt = self.match_crop(concentrated=True)
        self.assertIsNone(candidate)
        self.assertEqual(attempt["rejection_reason"], "concentrated_matches")


if __name__ == "__main__":
    unittest.main()

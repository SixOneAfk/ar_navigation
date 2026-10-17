# Photo Route: Four-Point Test

This browser experiment currently recognizes four ordered camera viewpoints. It does not
estimate XYZ coordinates, measure arrival distance, or move the navigation camera.
The first viewpoint is the view at your known start; the other three follow your
chosen physical route. Point IDs are independent of the building navigation graph.

## Add your photos

Copy real reference photos onto the machine running the Python CV service:

```text
apps/cv-service/route_photos/
  route.json
  point-01/
  point-02/
  point-03/
  point-04/
  point-05/
```

Every enabled point folder needs at least one usable image. Begin with a few different
photos per point, covering approach angles and lighting conditions. Several
photos of a point are alternatives, not separate route steps. JPEG, PNG, and WebP
are supported; convert HEIC to JPEG first. Images larger than 12 MB are skipped.
Up to 40 images per point are indexed, in filename order; the panel reports any
ignored or unusable files. A featureless wall or blurry photo may have too few
visual details to be usable.

On a fresh checkout the photo folders are empty. Their README files only keep
the directories in Git; they are not sample images.
Images are ignored by Git by default and must be copied separately to another
server. The preparation does not download models or need new Python dependencies.

Use readable filenames such as `front-day.jpg`, `approach-left.jpg`, and
`front-lights-on.jpg`. To replace an image, overwrite it or remove it and copy
the new one. Keep the point folder IDs unchanged unless you also edit `route.json`.
Rename points in `route.json` using each point's `name` field. The order in its
`points` array is the physical walk order. One to five unique point IDs may be
configured, and at least one must be enabled. Point 5 currently has `"enabled": false`;
its files stay in `point-05/`, but it is not required, indexed, or matched. To restore
it later, set `"enabled": true` and reload references. Omitting the flag means enabled.
No restart is needed: click `Reload references` after editing the catalog or photos.

## What to photograph

- Photograph what a walking user will actually see from the corridor, not an
  interior that is hidden behind a closed door.
- Prefer a distinctive door, wall panel, poster, or corner with surrounding
  details. Capture approximately the intended confirmation viewpoint.
- Do not fill the entire photo with a repeated room number, generic door panel,
  or tile pattern. Identical details in different points can be ambiguous.
  An unregistered look-alike can still produce a false match; test these views too.
- Portrait reference photos are supported. Photo Route sends the full camera
  image without cropping or stretching. Its longest side is at most 640 pixels,
  with the same 307,200-pixel budget as 640x480: typical frames are 480x640 in
  portrait, 360x640 for a 9:16 camera, or 640x480 in landscape. Small frames are
  not upscaled. References can have another aspect ratio. Overlapping detail
  views and a coarse view are prepared automatically, without changing your files.
- The matcher verifies a perspective transformation. It works best when enough
  matching details lie on a common plane, such as a door and its wall. A partial
  reference can match: the whole photograph need not fit inside the live frame.
  Strong viewpoint changes in a deep, non-planar corridor may not match; add relevant
  approach photos rather than expecting arbitrary views to work.
- Use stable architectural details, not people or movable furniture. Avoid
  motion blur, reflections, and changes that hide the reference completely.

## Run and test

From the repository root, with the normal dependencies already installed:

```bash
npm run start:dev:all:with-cv
```

Open the HTTPS frontend on the phone, then:

1. Open the new `Photo Route` button in the control dock.
2. Click `Reload references`. All four enabled points must have usable photos.
3. Click `Enable Camera`; camera permission still requires HTTPS or localhost.
4. Optionally select `Hide Model` to see the live camera unobstructed.
5. Stand at the first reference viewpoint and select `Start / Resume route`.
6. Keep its distinctive details visible until it is confirmed, then move to the
   next point. The target advances automatically in order.
7. Close the panel if needed. A compact HUD keeps showing the target, visible
   viewpoint, match score, and confirmation count. Reopen `Photo Route` for details.

`Floor and wall analysis` and `Object analysis` are available in both Camera and
Photo Route, off by default. Camera permission alone starts neither mode. While
Photo Route runs it pauses both optional analyzers, including their overlays and
client requests. Pausing or completing the route resumes only modes previously
enabled manually. Photo matching itself does not invoke object detection or OCR.

The panel distinguishes the current target, recognized view, and best candidate.
If a later or previously visited point is recognized, the target does not advance.
`Unknown` is a valid result. Similar candidates produce `ambiguous`, not a forced
choice. Seeing a distant door is not proof that the phone has arrived at it.

`Pause route` stops photo requests and preserves confirmed points. `Reset route`
returns to point 1. `Test start point` permits a manual restart from another point;
earlier points are marked skipped, not confirmed. Settings changes pause tracking
and clear the pending confirmation streak. A completed route never loops.
Progress belongs to the current browser tab and resets when the page is refreshed.

After stable confirmation of the fourth point, a finish dialog appears even if
the Photo Route panel is closed. It names the final viewpoint and shows how many
points were actually confirmed. Manually skipped points are reported separately.
`Done` dismisses the dialog without restarting matching. `Reset route` clears
progress and returns to point 1; press Start again for another test. The native
modal supports keyboard focus and Escape dismissal. A rejected or ambiguous
final view never triggers completion. The dialog does not measure arrival distance.

## Scores and performance

This implementation uses cached multi-scale SIFT reference features, FLANN
descriptor search, and RANSAC homography verification. Scores combine geometric inliers, inlier ratio,
spatial coverage, and reprojection error. They are not calibrated probabilities.
There is no OCR or YOLO dependency in this route.

Reference preprocessing keeps a full coarse view and overlapping detail tiles
(480x640 in portrait, 640x480 in landscape). Reference detail images are limited
to a 1280-pixel longest side and 1,228,800 pixels, preserving both orientations.
Python retains the full portrait frame instead of shrinking its height to 480.
Descriptors share one reference coordinate
system and are computed once per reference revision, not per camera frame.
Multiple features describing the same live detail cannot cast duplicate votes.
Reference files and photo counts do not change; no generated crops need managing.

Geometry checks use the common visible region rather than imposing a minimum
percentage of the entire reference photo. At least 12 inliers, a 45% inlier ratio,
spatial spread in both the shared region and live frame, plausible orientation,
and a median reprojection error no greater than three pixels are still required.
`Reference area in view` reports the fraction of the reference visible in the
frame; a small value is not itself a rejection. `Shared-area feature coverage`
reports how well matching details span that shared region. The preview outline
encloses matched details, not inferred object boundaries or the entire reference.
Tiny, blurry, repetitive, or strongly distorted crops can still be unrecognizable.
Detail tiling cannot recover features absent from the original photograph or
predict surfaces hidden behind objects. Add genuine alternate views for those cases.

`Match score` is only available after geometric verification. If no reference
passes that verification, the panel shows `Not available`, not a misleading `0%`.
The last-frame statistics still report image feature counts, tentative reference
matches, and why geometry was rejected. A tentative reference is labeled
`unverified` and cannot advance the route. A valid geometric score remains visible
even if the score, cross-point lead, or visible-area threshold rejects confirmation.
The preview outline is a separate SVG layer. Capture reads only the camera video,
not the page or its overlays; the submitted JPEG contains no app-drawn lines.
The outline uses normalized coordinates and follows the actual image aspect
ratio. `Frame size` shows the dimensions of the JPEG submitted for matching.
The floor/wall and object analyzers keep their existing 640x480 capture format.

Default confirmation rules:

- Match score at least 60%.
- At least a 10-point lead over a different route point.
- At least 12 geometrically consistent matches, with spread across the images.
- Visible projected reference area at least 10% of the frame.
- Three consecutive accepted frames spanning at least one second.
- Responses older than three seconds cannot confirm a point.

The area check is a visual-size gate, not a distance measurement. Camera crop,
reference framing, and perspective all affect it. Adjust the settings using
independent test footage; do not lower thresholds solely to force a match.

Frames never overlap on a client. By default the next fresh JPEG is captured one
second after the previous response. Normal structural-line requests pause while
photo tracking runs, as do optional object-analysis requests; the same camera
stream is reused. The Python photo analyzer also returns `busy` instead of queuing
concurrent matching work. References are
computed once and reused until a file changes or a reload is requested. Catalog
loading/reloading itself is serialized and can take longer with many photos.

If reference files change during a walk, the revision changes and the client
pauses rather than mixing old confirmations with new data. Reload and restart.
No live frames are saved or sent to an external service. Reference photos remain
local to your CV server. `CV_ROUTE_PHOTOS_DIR` can point to another catalog root.

For a real accuracy check, record a separate walk after collecting references,
including wrong turns, repeated doors, unrelated views, and different lighting.
Measure false confirmations as well as successful recognitions and latency.
Synthetic unit tests are not a guarantee of accuracy on your building.

## APIs and checks

- `GET /api/v1/cv/photo-route`: catalog and reference readiness through Gateway.
- `GET /api/v1/cv/photo-route?reload=true`: rebuild reference features.
- `POST /api/v1/cv/photo-route/match`: image and expected point, revision, thresholds.
- Python exposes the same suffixes under `/api/v1/photo-route`.

Python unit tests, from `apps/cv-service`:

```bash
.venv/bin/python -m unittest discover -p 'test_*.py'
```

Client tests, from `apps/client`:

```bash
./node_modules/.bin/vitest run --environment jsdom
```

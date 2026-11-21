# CV localization references

Localization is independent of Photo Route. Put reference photographs in this
directory and add each to `catalog.json`:

```json
{
  "id": "your_reference_id",
  "image": "your_reference.jpg",
  "pointId": "existing_graph_point_id",
  "facingTarget": "another_existing_graph_point_id"
}
```

`facingTarget` is optional. Paths are relative to this directory. IDs must be
unique. Several images may use the same graph point. The catalog starts empty;
no photographs or example locations are included. Invalid graph points and
unreadable images are reported in the camera panel.

`searchRadiusMeters` limits selection by walking distance along valid graph
branches; `updateThresholdMeters` controls when the search is refreshed as the
nearest graph point changes. These use the existing estimated graph location,
which can itself be inaccurate near walls. Frames are sampled once per second
after each request completes. Three consecutive matches are required, and a
reference must disappear or leave the active area before reacquisition.
Corrections also have an eight-second cooldown. Calibrate these settings and
validate reference viewpoints in the building before relying on localization.

package com.example.indoorpositioning;

/**
 * Represents a lightweight camera feature-tracking interface for the indoor positioning pipeline.
 *
 * <p>Purpose: provide a pluggable point for camera observations that can later be fused with inertial
 * estimates through an EKF.</p>
 *
 * <p>Inputs:
 * <ul>
 *   <li>Feature observations from an image-processing pipeline</li>
 * </ul>
 *
 * <p>Outputs:
 * <ul>
 *   <li>A simple measurement object that can be consumed by an EKF stage</li>
 * </ul>
 */
public final class CameraFeatureTracker {
    private final double[] featurePosition;

    public CameraFeatureTracker(double[] featurePosition) {
        if (featurePosition == null || featurePosition.length != 2) {
            throw new IllegalArgumentException("Feature position must be a 2D vector.");
        }
        this.featurePosition = new double[] {featurePosition[0], featurePosition[1]};
    }

    public double[] getFeaturePosition() {
        return new double[] {featurePosition[0], featurePosition[1]};
    }
}

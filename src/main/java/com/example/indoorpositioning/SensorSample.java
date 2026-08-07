package com.example.indoorpositioning;

/**
 * Immutable sensor sample for the indoor positioning pipeline.
 *
 * <p>Purpose: carry synchronized accelerometer and gyroscope measurements from one instant.
 *
 * <p>Inputs:
 * <ul>
 *   <li>Accelerometer readings in meters per second squared (m/s²)</li>
 *   <li>Gyroscope readings in radians per second (rad/s)</li>
 *   <li>An optional timestamp in seconds</li>
 * </ul>
 *
 * <p>Outputs:
 * <ul>
 *   <li>A read-only container consumed by the orientation estimator</li>
 * </ul>
 */
public final class SensorSample implements SensorReading {
    private final double accelerometerX;
    private final double accelerometerY;
    private final double accelerometerZ;
    private final double gyroscopeX;
    private final double gyroscopeY;
    private final double gyroscopeZ;
    private final double timestampSeconds;

    /**
     * Creates a sample from a single sensor reading event.
     */
    public SensorSample(
            double accelerometerX,
            double accelerometerY,
            double accelerometerZ,
            double gyroscopeX,
            double gyroscopeY,
            double gyroscopeZ,
            double timestampSeconds) {
        this.accelerometerX = accelerometerX;
        this.accelerometerY = accelerometerY;
        this.accelerometerZ = accelerometerZ;
        this.gyroscopeX = gyroscopeX;
        this.gyroscopeY = gyroscopeY;
        this.gyroscopeZ = gyroscopeZ;
        this.timestampSeconds = timestampSeconds;
    }

    public double getAccelerometerX() {
        return accelerometerX;
    }

    public double getAccelerometerY() {
        return accelerometerY;
    }

    public double getAccelerometerZ() {
        return accelerometerZ;
    }

    public double getGyroscopeX() {
        return gyroscopeX;
    }

    public double getGyroscopeY() {
        return gyroscopeY;
    }

    public double getGyroscopeZ() {
        return gyroscopeZ;
    }

    public double getTimestampSeconds() {
        return timestampSeconds;
    }

    @Override
    public String toString() {
        return "SensorSample{" +
                "accelerometer=(" + accelerometerX + ", " + accelerometerY + ", " + accelerometerZ + ")" +
                ", gyroscope=(" + gyroscopeX + ", " + gyroscopeY + ", " + gyroscopeZ + ")" +
                ", timestampSeconds=" + timestampSeconds +
                '}';
    }
}

package com.example.indoorpositioning;

/**
 * Orchestrates the indoor positioning pipeline from inertial sensors and camera observations.
 *
 * <p>Purpose: connect the stages in the requested order:</p>
 * <ol>
 *   <li>Sensor reading</li>
 *   <li>Orientation estimation (Madgwick filter)</li>
 *   <li>Gravity removal</li>
 *   <li>Transform acceleration to world coordinates</li>
 *   <li>Velocity integration</li>
 *   <li>Position integration</li>
 *   <li>Camera feature tracking</li>
 *   <li>Extended Kalman Filter correction</li>
 * </ol>
 *
 * <p>Inputs:
 * <ul>
 *   <li>Sensor samples from the accelerometer and gyroscope</li>
 *   <li>Camera feature observations</li>
 * </ul>
 *
 * <p>Outputs:
 * <ul>
 *   <li>Estimated position and distance traveled</li>
 * </ul>
 */
public final class IndoorPositioningPipeline {
    private final MadgwickFilter madgwickFilter;
    private final AccelerationProcessor accelerationProcessor;
    private final DeadReckoningEstimator deadReckoningEstimator;
    private final ExtendedKalmanFilter extendedKalmanFilter;

    private double lastDistanceMeters;

    public IndoorPositioningPipeline() {
        this(200.0, 0.041);
    }

    public IndoorPositioningPipeline(double sampleRateHz, double beta) {
        this.madgwickFilter = new MadgwickFilter(sampleRateHz, beta);
        this.accelerationProcessor = new AccelerationProcessor();
        this.deadReckoningEstimator = new DeadReckoningEstimator();
        this.extendedKalmanFilter = new ExtendedKalmanFilter();
        this.lastDistanceMeters = 0.0;
    }

    public PositionEstimate update(SensorSample sample, CameraFeatureTracker cameraObservation, double deltaSeconds) {
        if (sample == null) {
            throw new IllegalArgumentException("Sample must not be null.");
        }
        if (cameraObservation == null) {
            throw new IllegalArgumentException("Camera observation must not be null.");
        }

        OrientationEstimate orientation = madgwickFilter.update(sample, deltaSeconds);
        double[] accelerationWorld = accelerationProcessor.process(
                sample.getAccelerometerX(),
                sample.getAccelerometerY(),
                sample.getAccelerometerZ(),
                orientation);

        double[] positionEstimate = deadReckoningEstimator.update(accelerationWorld, deltaSeconds);
        double[] correctedPosition = extendedKalmanFilter.update(positionEstimate, cameraObservation);

        double distance = Math.sqrt(
                correctedPosition[0] * correctedPosition[0] +
                        correctedPosition[1] * correctedPosition[1] +
                        correctedPosition[2] * correctedPosition[2]);
        lastDistanceMeters = distance;

        return new PositionEstimate(correctedPosition[0], correctedPosition[1], correctedPosition[2], distance);
    }

    public double getLastDistanceMeters() {
        return lastDistanceMeters;
    }

    public void reset() {
        madgwickFilter.reset();
        deadReckoningEstimator.reset();
        lastDistanceMeters = 0.0;
    }
}

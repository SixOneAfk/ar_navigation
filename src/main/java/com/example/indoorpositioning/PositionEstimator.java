package com.example.indoorpositioning;

/**
 * Estimates position by fusing inertial motion with camera-based translation using an Extended Kalman Filter.
 *
 * <p>Purpose:
 * This class combines a prediction from inertial measurements with a correction from visual tracking.
 * It is intended for indoor positioning where GPS is unavailable.</p>
 *
 * <p>Inputs:
 * <ul>
 *   <li>Inertial position estimate from acceleration and gyroscope-based integration</li>
 *   <li>Camera translation estimate in pixels or arbitrary visual units</li>
 * </ul>
 *
 * <p>Outputs:
 * <ul>
 *   <li>Corrected position estimate in meters</li>
 * </ul>
 *
 * <p>Model:
 * The filter uses a simple linear prediction model and a measurement model from the camera.
 * The prediction step is
 * <pre>
 * x_{k|k-1} = x_{k-1|k-1} + u_k
 * </pre>
 * and the correction step is
 * <pre>
 * x_{k|k} = x_{k|k-1} + K (z_k - h(x_{k|k-1}))
 * </pre>
 * where {@code z_k} is the camera translation measurement.</p>
 */
public final class PositionEstimator {
    private static final double DEFAULT_PROCESS_NOISE = 0.05;
    private static final double DEFAULT_MEASUREMENT_NOISE = 0.2;

    private final double processNoise;
    private final double measurementNoise;

    private double[] state;
    private double covariance;

    /**
     * Creates a position estimator with default noise values.
     */
    public PositionEstimator() {
        this(DEFAULT_PROCESS_NOISE, DEFAULT_MEASUREMENT_NOISE);
    }

    /**
     * Creates a position estimator with custom noise values.
     *
     * @param processNoise covariance of the motion model
     * @param measurementNoise covariance of the camera measurement model
     */
    public PositionEstimator(double processNoise, double measurementNoise) {
        if (processNoise < 0.0) {
            throw new IllegalArgumentException("Process noise must be non-negative.");
        }
        if (measurementNoise < 0.0) {
            throw new IllegalArgumentException("Measurement noise must be non-negative.");
        }

        this.processNoise = processNoise;
        this.measurementNoise = measurementNoise;
        this.state = new double[] {0.0, 0.0, 0.0};
        this.covariance = 1.0;
    }

    /**
     * Runs one prediction-correction cycle.
     *
     * @param inertialPositionEstimate predicted position from inertial integration as {@code [x, y, z]}
     * @param cameraTranslationEstimate translation estimate from the camera as {@code [dx, dy, dz]}
     * @return corrected position estimate as {@code [x, y, z]}
     */
    public double[] update(double[] inertialPositionEstimate, double[] cameraTranslationEstimate) {
        if (inertialPositionEstimate == null || inertialPositionEstimate.length != 3) {
            throw new IllegalArgumentException("Inertial position estimate must be a 3D vector.");
        }
        if (cameraTranslationEstimate == null || cameraTranslationEstimate.length != 3) {
            throw new IllegalArgumentException("Camera translation estimate must be a 3D vector.");
        }

        double[] predictedState = predict(inertialPositionEstimate);
        double[] correctedState = correct(predictedState, cameraTranslationEstimate);

        state = correctedState;
        return new double[] {state[0], state[1], state[2]};
    }

    /**
     * Returns the current corrected state.
     */
    public double[] getState() {
        return new double[] {state[0], state[1], state[2]};
    }

    /**
     * Resets the estimator to the zero state.
     */
    public void reset() {
        state = new double[] {0.0, 0.0, 0.0};
        covariance = 1.0;
    }

    private double[] predict(double[] inertialPositionEstimate) {
        double[] predicted = new double[3];
        for (int i = 0; i < 3; i++) {
            predicted[i] = inertialPositionEstimate[i];
        }

        covariance += processNoise;
        return predicted;
    }

    private double[] correct(double[] predictedState, double[] cameraTranslationEstimate) {
        double innovation = cameraTranslationEstimate[0] - predictedState[0];
        double kalmanGain = covariance / (covariance + measurementNoise);

        double[] corrected = new double[3];
        corrected[0] = predictedState[0] + kalmanGain * innovation;
        corrected[1] = predictedState[1] + kalmanGain * (cameraTranslationEstimate[1] - predictedState[1]);
        corrected[2] = predictedState[2] + kalmanGain * (cameraTranslationEstimate[2] - predictedState[2]);

        covariance = (1.0 - kalmanGain) * covariance;
        return corrected;
    }
}

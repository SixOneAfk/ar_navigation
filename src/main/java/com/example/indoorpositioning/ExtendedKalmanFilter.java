package com.example.indoorpositioning;

/**
 * A compact Extended Kalman Filter for correcting the dead-reckoning estimate with camera observations.
 *
 * <p>Purpose: fuse the inertial estimate with visual feature observations to reduce drift.</p>
 *
 * <p>Model:
 * <pre>
 * x_{k+1} = x_k + v_k \Delta t
 * z_k = H x_k + v_k
 * </pre>
 *
 * <p>Inputs:
 * <ul>
 *   <li>Predicted position from the inertial pipeline</li>
 *   <li>Camera feature measurements</li>
 * </ul>
 *
 * <p>Outputs:
 * <ul>
 *   <li>A corrected position estimate</li>
 * </ul>
 */
public final class ExtendedKalmanFilter {
    private final double[] state;
    private final double[][] covariance;

    public ExtendedKalmanFilter() {
        this.state = new double[] {0.0, 0.0, 0.0};
        this.covariance = new double[][] {
                {1.0, 0.0, 0.0},
                {0.0, 1.0, 0.0},
                {0.0, 0.0, 1.0}
        };
    }

    public double[] update(double[] predictedPosition, CameraFeatureTracker cameraObservation) {
        if (predictedPosition == null || predictedPosition.length != 3) {
            throw new IllegalArgumentException("Predicted position must be a 3D vector.");
        }
        if (cameraObservation == null) {
            throw new IllegalArgumentException("Camera observation must not be null.");
        }

        double[] measurement = new double[] {
                cameraObservation.getFeaturePosition()[0],
                cameraObservation.getFeaturePosition()[1],
                predictedPosition[2]
        };

        double[] corrected = new double[3];
        for (int i = 0; i < 3; i++) {
            corrected[i] = predictedPosition[i] + 0.1 * (measurement[i] - predictedPosition[i]);
        }

        state[0] = corrected[0];
        state[1] = corrected[1];
        state[2] = corrected[2];

        return new double[] {state[0], state[1], state[2]};
    }
}

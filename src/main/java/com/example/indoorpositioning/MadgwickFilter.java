package com.example.indoorpositioning;

/**
 * Implements the Madgwick filter for estimating device orientation from inertial sensors.
 *
 * <p>Purpose: fuse gyroscope integration with accelerometer correction to estimate attitude without GPS.
 *
 * <p>Mathematical model:
 * <pre>
 * q_{k+1} = q_k + \dot{q} \Delta t
 * \dot{q} = 0.5 q \otimes \omega - \beta \nabla f(q)
 * </pre>
 * where {@code q} is the quaternion, {@code \omega} is the angular velocity vector, and
 * {@code \beta} controls the correction strength from the accelerometer.
 *
 * <p>Inputs:
 * <ul>
 *   <li>A {@link SensorSample} containing accelerometer and gyroscope data</li>
 *   <li>A time step {@code deltaSeconds}</li>
 * </ul>
 *
 * <p>Outputs:
 * <ul>
 *   <li>An {@link OrientationEstimate} representing the updated device orientation</li>
 * </ul>
 */
public final class MadgwickFilter {
    private static final double EPSILON = 1.0e-12;

    private final double beta;
    private final double sampleRateHz;
    private double[] quaternion;

    /**
     * Creates a new filter.
     *
     * @param sampleRateHz the sampling rate in hertz; it must be greater than zero
     * @param beta the correction gain; a typical starting value is 0.041
     */
    public MadgwickFilter(double sampleRateHz, double beta) {
        if (sampleRateHz <= 0.0) {
            throw new IllegalArgumentException("Sample rate must be greater than zero.");
        }
        if (beta <= 0.0) {
            throw new IllegalArgumentException("Beta must be greater than zero.");
        }
        this.sampleRateHz = sampleRateHz;
        this.beta = beta;
        this.quaternion = new double[] {1.0, 0.0, 0.0, 0.0};
    }

    /**
     * Updates the internal state with a new sensor sample.
     *
     * @param sample the accelerometer and gyroscope sample
     * @param deltaSeconds the elapsed time since the previous sample in seconds
     * @return the updated orientation estimate
     */
    public OrientationEstimate update(SensorSample sample, double deltaSeconds) {
        if (sample == null) {
            throw new IllegalArgumentException("Sample must not be null.");
        }

        double effectiveDeltaSeconds = deltaSeconds > EPSILON ? deltaSeconds : 1.0 / sampleRateHz;
        double[] correctedQuaternion = integrate(sample, effectiveDeltaSeconds);
        quaternion = correctedQuaternion;
        return new OrientationEstimate(quaternion[0], quaternion[1], quaternion[2], quaternion[3]);
    }

    /**
     * Returns the latest orientation estimate without processing a new sample.
     */
    public OrientationEstimate getLatestEstimate() {
        return new OrientationEstimate(quaternion[0], quaternion[1], quaternion[2], quaternion[3]);
    }

    /**
     * Resets the filter to the identity quaternion.
     */
    public void reset() {
        quaternion = new double[] {1.0, 0.0, 0.0, 0.0};
    }

    private double[] integrate(SensorSample sample, double deltaSeconds) {
        double[] gradient = computeGradient(sample.getAccelerometerX(), sample.getAccelerometerY(), sample.getAccelerometerZ());
        double[] quaternionRate = computeQuaternionRate(
                sample.getGyroscopeX(),
                sample.getGyroscopeY(),
                sample.getGyroscopeZ());

        quaternionRate[0] -= beta * gradient[0];
        quaternionRate[1] -= beta * gradient[1];
        quaternionRate[2] -= beta * gradient[2];
        quaternionRate[3] -= beta * gradient[3];

        double[] nextQuaternion = new double[4];
        for (int i = 0; i < 4; i++) {
            nextQuaternion[i] = quaternion[i] + quaternionRate[i] * deltaSeconds;
        }

        return normalize(nextQuaternion);
    }

    private double[] computeGradient(double ax, double ay, double az) {
        double q0 = quaternion[0];
        double q1 = quaternion[1];
        double q2 = quaternion[2];
        double q3 = quaternion[3];

        double norm = Math.sqrt(ax * ax + ay * ay + az * az);
        if (norm <= EPSILON) {
            return new double[] {0.0, 0.0, 0.0, 0.0};
        }

        ax /= norm;
        ay /= norm;
        az /= norm;

        double f1 = 2.0 * (q1 * q3 - q0 * q2) - ax;
        double f2 = 2.0 * (q0 * q1 + q2 * q3) - ay;
        double f3 = 2.0 * 0.5 - 2.0 * (q1 * q1 + q2 * q2) - az;

        double j11 = -2.0 * q2;
        double j12 = 2.0 * q3;
        double j13 = -2.0 * q0;
        double j14 = 2.0 * q1;
        double j21 = 2.0 * q1;
        double j22 = 2.0 * q0;
        double j23 = 2.0 * q3;
        double j24 = 2.0 * q2;
        double j31 = 0.0;
        double j32 = -4.0 * q1;
        double j33 = -4.0 * q2;
        double j34 = 0.0;

        return new double[] {
                j11 * f1 + j21 * f2 + j31 * f3,
                j12 * f1 + j22 * f2 + j32 * f3,
                j13 * f1 + j23 * f2 + j33 * f3,
                j14 * f1 + j24 * f2 + j34 * f3
        };
    }

    private double[] computeQuaternionRate(double gx, double gy, double gz) {
        double q0 = quaternion[0];
        double q1 = quaternion[1];
        double q2 = quaternion[2];
        double q3 = quaternion[3];

        return new double[] {
                0.5 * (-q1 * gx - q2 * gy - q3 * gz),
                0.5 * (q0 * gx + q2 * gz - q3 * gy),
                0.5 * (q0 * gy - q1 * gz + q3 * gx),
                0.5 * (q0 * gz + q1 * gy - q2 * gx)
        };
    }

    private double[] normalize(double[] vector) {
        double norm = Math.sqrt(vector[0] * vector[0] + vector[1] * vector[1] + vector[2] * vector[2] + vector[3] * vector[3]);
        if (norm <= EPSILON) {
            return new double[] {1.0, 0.0, 0.0, 0.0};
        }

        return new double[] {
                vector[0] / norm,
                vector[1] / norm,
                vector[2] / norm,
                vector[3] / norm
        };
    }
}

package com.example.indoorpositioning;

/**
 * Estimates device orientation by fusing accelerometer and gyroscope measurements with the
 * Madgwick filter.
 *
 * <p>Purpose:
 * This class produces a quaternion-based orientation estimate and a corresponding rotation matrix.
 * It is suitable for indoor positioning systems that cannot rely on GPS and instead need a stable
 * attitude estimate from inertial sensors.</p>
 *
 * <p>Inputs:
 * <ul>
 *   <li>Accelerometer readings in meters per second squared (m/s²): ax, ay, az</li>
 *   <li>Gyroscope readings in radians per second (rad/s): gx, gy, gz</li>
 *   <li>Timestamp in seconds</li>
 * </ul>
 *
 * <p>Outputs:
 * <ul>
 *   <li>Quaternion orientation: {@code [w, x, y, z]}</li>
 *   <li>Rotation matrix: a 3x3 matrix that maps body-frame vectors to world-frame vectors</li>
 * </ul>
 *
 * <p>Mathematical model:
 * The filter updates the quaternion using
 * <pre>
 * q_{k+1} = q_k + \dot{q} \Delta t
 * </pre>
 * where
 * <pre>
 * \dot{q} = 0.5 q \otimes \omega - \beta \nabla f(q)
 * </pre>
 * and {@code \nabla f(q)} is the gradient of the accelerometer error function.</p>
 */
public final class OrientationEstimator {
    private static final double EPSILON = 1.0e-12;

    private final double sampleRateHz;
    private final double beta;

    private double[] quaternion;
    private double lastTimestampSeconds;
    private boolean initialized;

    /**
     * Creates a new estimator.
     *
     * @param sampleRateHz measurement rate in hertz; must be greater than zero.
     * @param beta Madgwick correction gain; a typical value is 0.041.
     */
    public OrientationEstimator(double sampleRateHz, double beta) {
        if (sampleRateHz <= 0.0) {
            throw new IllegalArgumentException("Sample rate must be greater than zero.");
        }
        if (beta <= 0.0) {
            throw new IllegalArgumentException("Beta must be greater than zero.");
        }

        this.sampleRateHz = sampleRateHz;
        this.beta = beta;
        this.quaternion = new double[] {1.0, 0.0, 0.0, 0.0};
        this.lastTimestampSeconds = 0.0;
        this.initialized = false;
    }

    /**
     * Initializes the filter to the identity quaternion.
     */
    public void initialize() {
        quaternion = new double[] {1.0, 0.0, 0.0, 0.0};
        lastTimestampSeconds = 0.0;
        initialized = true;
    }

    /**
     * Updates the orientation estimate with a new inertial sensor sample.
     *
     * @param ax accelerometer reading on the x-axis in m/s²
     * @param ay accelerometer reading on the y-axis in m/s²
     * @param az accelerometer reading on the z-axis in m/s²
     * @param gx gyroscope reading on the x-axis in rad/s
     * @param gy gyroscope reading on the y-axis in rad/s
     * @param gz gyroscope reading on the z-axis in rad/s
     * @param timestampSeconds current timestamp in seconds
     */
    public void update(
            double ax,
            double ay,
            double az,
            double gx,
            double gy,
            double gz,
            double timestampSeconds) {
        if (!initialized) {
            initialize();
        }

        double deltaSeconds = computeDeltaSeconds(timestampSeconds);
        double[] gradient = computeGradient(ax, ay, az);
        double[] quaternionRate = computeQuaternionRate(gx, gy, gz);

        quaternionRate[0] -= beta * gradient[0];
        quaternionRate[1] -= beta * gradient[1];
        quaternionRate[2] -= beta * gradient[2];
        quaternionRate[3] -= beta * gradient[3];

        double[] nextQuaternion = new double[4];
        for (int i = 0; i < 4; i++) {
            nextQuaternion[i] = quaternion[i] + quaternionRate[i] * deltaSeconds;
        }

        quaternion = VectorMath.normalize(nextQuaternion);
        lastTimestampSeconds = timestampSeconds;
    }

    /**
     * Returns the current quaternion orientation.
     *
     * @return a new array containing {@code [w, x, y, z]}
     */
    public double[] getQuaternion() {
        return new double[] {quaternion[0], quaternion[1], quaternion[2], quaternion[3]};
    }

    /**
     * Converts the current quaternion to a rotation matrix.
     *
     * <p>The rotation matrix is derived from the quaternion using the standard formula:
     * <pre>
     * R =
     * [ 1 - 2y² - 2z²   2xy - 2zw       2xz + 2yw ]
     * [ 2xy + 2zw       1 - 2x² - 2z²   2yz - 2xw ]
     * [ 2xz - 2yw       2yz + 2xw       1 - 2x² - 2y² ]
     * </pre>
     * </p>
     *
     * @return a 3x3 rotation matrix stored as row-major values
     */
    public double[][] getRotationMatrix() {
        double w = quaternion[0];
        double x = quaternion[1];
        double y = quaternion[2];
        double z = quaternion[3];

        double[][] rotationMatrix = new double[3][3];
        rotationMatrix[0][0] = 1.0 - 2.0 * (y * y + z * z);
        rotationMatrix[0][1] = 2.0 * (x * y - z * w);
        rotationMatrix[0][2] = 2.0 * (x * z + y * w);

        rotationMatrix[1][0] = 2.0 * (x * y + z * w);
        rotationMatrix[1][1] = 1.0 - 2.0 * (x * x + z * z);
        rotationMatrix[1][2] = 2.0 * (y * z - x * w);

        rotationMatrix[2][0] = 2.0 * (x * z - y * w);
        rotationMatrix[2][1] = 2.0 * (y * z + x * w);
        rotationMatrix[2][2] = 1.0 - 2.0 * (x * x + y * y);

        return rotationMatrix;
    }

    private double computeDeltaSeconds(double timestampSeconds) {
        if (!initialized) {
            lastTimestampSeconds = timestampSeconds;
            return 1.0 / sampleRateHz;
        }

        double delta = timestampSeconds - lastTimestampSeconds;
        if (delta <= EPSILON) {
            return 1.0 / sampleRateHz;
        }
        return delta;
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

}

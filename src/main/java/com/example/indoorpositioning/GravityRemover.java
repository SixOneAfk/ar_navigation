package com.example.indoorpositioning;

/**
 * Removes gravity from raw accelerometer measurements.
 *
 * <p>Purpose:
 * This class estimates the gravity vector from a quaternion orientation, rotates it into the device
 * frame, and subtracts it from the measured acceleration so that only linear acceleration remains.</p>
 *
 * <p>Inputs:
 * <ul>
 *   <li>Quaternion orientation: {@code [w, x, y, z]}</li>
 *   <li>Raw accelerometer data in m/s²: {@code ax, ay, az}</li>
 * </ul>
 *
 * <p>Outputs:
 * <ul>
 *   <li>Linear acceleration with gravity removed in m/s²: {@code [ax', ay', az']}</li>
 * </ul>
 *
 * <p>Mathematical model:
 * The measured acceleration is modeled as
 * <pre>
 * a_measured = a_linear + g
 * </pre>
 * so the linear acceleration is obtained as
 * <pre>
 * a_linear = a_measured - g
 * </pre>
 * where {@code g} is the gravity vector expressed in the device frame.</p>
 */
public final class GravityRemover {
    private static final double GRAVITY_METERS_PER_SECOND_SQUARED = 9.80665;

    /**
     * Removes gravity from the measured acceleration.
     *
     * @param quaternion the current orientation expressed as {@code [w, x, y, z]}
     * @param ax measured acceleration along x in m/s²
     * @param ay measured acceleration along y in m/s²
     * @param az measured acceleration along z in m/s²
     * @return linear acceleration with gravity removed in the device frame as {@code [x, y, z]}
     */
    public double[] removeGravity(double[] quaternion, double ax, double ay, double az) {
        if (quaternion == null || quaternion.length != 4) {
            throw new IllegalArgumentException("Quaternion must be a 4-element array [w, x, y, z].");
        }

        double[] gravityInWorld = new double[] {0.0, 0.0, GRAVITY_METERS_PER_SECOND_SQUARED};
        double[] gravityInDevice = VectorMath.rotateQuaternionToMatrix(quaternion, gravityInWorld);

        return new double[] {
                ax - gravityInDevice[0],
                ay - gravityInDevice[1],
                az - gravityInDevice[2]
        };
    }

}

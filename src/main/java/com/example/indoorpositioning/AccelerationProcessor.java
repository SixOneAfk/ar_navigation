package com.example.indoorpositioning;

/**
 * Removes gravity from accelerometer data and transforms the remaining acceleration into world coordinates.
 *
 * <p>Purpose: convert the device-frame acceleration into a world-frame acceleration estimate that is
 * suitable for integration into velocity and position.</p>
 *
 * <p>Mathematical model:
 * <pre>
 * a_world = R_device_to_world^T (a_device - g_device)
 * </pre>
 * where {@code g_device} is the gravity vector in the device frame and {@code R} is the rotation matrix
 * derived from the orientation estimate.
 *
 * <p>Inputs:
 * <ul>
 *   <li>Raw acceleration in the device frame</li>
 *   <li>An orientation estimate from the Madgwick filter</li>
 * </ul>
 *
 * <p>Outputs:
 * <ul>
 *   <li>Gravity-free acceleration expressed in a world frame</li>
 * </ul>
 */
public final class AccelerationProcessor {
    private static final double GRAVITY_METERS_PER_SECOND_SQUARED = 9.80665;

    /**
     * Removes gravity and rotates the acceleration into the world frame.
     */
    public double[] process(double ax, double ay, double az, OrientationEstimate orientation) {
        if (orientation == null) {
            throw new IllegalArgumentException("Orientation estimate must not be null.");
        }

        double[] gravity = estimateGravityInDeviceFrame(orientation);
        double[] corrected = new double[] {
                ax - gravity[0],
                ay - gravity[1],
                az - gravity[2]
        };

        return rotateToWorld(corrected, orientation);
    }

    private double[] estimateGravityInDeviceFrame(OrientationEstimate orientation) {
        double roll = orientation.getRollRadians();
        double pitch = orientation.getPitchRadians();
        double yaw = orientation.getYawRadians();

        double sinRoll = Math.sin(roll);
        double cosRoll = Math.cos(roll);
        double sinPitch = Math.sin(pitch);
        double cosPitch = Math.cos(pitch);
        double sinYaw = Math.sin(yaw);
        double cosYaw = Math.cos(yaw);

        return new double[] {
                GRAVITY_METERS_PER_SECOND_SQUARED * (sinRoll * sinYaw + cosRoll * cosPitch * cosYaw),
                GRAVITY_METERS_PER_SECOND_SQUARED * (cosRoll * sinPitch),
                GRAVITY_METERS_PER_SECOND_SQUARED * (cosRoll * cosPitch * sinYaw - sinRoll * cosYaw)
        };
    }

    private double[] rotateToWorld(double[] vector, OrientationEstimate orientation) {
        double roll = orientation.getRollRadians();
        double pitch = orientation.getPitchRadians();
        double yaw = orientation.getYawRadians();

        double sinRoll = Math.sin(roll);
        double cosRoll = Math.cos(roll);
        double sinPitch = Math.sin(pitch);
        double cosPitch = Math.cos(pitch);
        double sinYaw = Math.sin(yaw);
        double cosYaw = Math.cos(yaw);

        double x = vector[0];
        double y = vector[1];
        double z = vector[2];

        return new double[] {
                cosYaw * (cosPitch * x + sinPitch * sinRoll * y + sinPitch * cosRoll * z)
                        - sinYaw * (cosRoll * y - sinRoll * z),
                sinYaw * (cosPitch * x + sinPitch * sinRoll * y + sinPitch * cosRoll * z)
                        + cosYaw * (cosRoll * y - sinRoll * z),
                -sinPitch * x + cosPitch * sinRoll * y + cosPitch * cosRoll * z
        };
    }
}

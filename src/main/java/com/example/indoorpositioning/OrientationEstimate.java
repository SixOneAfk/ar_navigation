package com.example.indoorpositioning;

import java.util.Arrays;

/**
 * A normalized orientation estimate expressed as a quaternion and Euler angles.
 *
 * <p>Purpose: provide a stable output type for the orientation estimation stage.
 *
 * <p>Inputs:
 * <ul>
 *   <li>A quaternion representing the device attitude</li>
 * </ul>
 *
 * <p>Outputs:
 * <ul>
 *   <li>Quaternion components</li>
 *   <li>Roll, pitch, and yaw angles in radians</li>
 * </ul>
 */
public final class OrientationEstimate {
    private final double w;
    private final double x;
    private final double y;
    private final double z;
    private final double rollRadians;
    private final double pitchRadians;
    private final double yawRadians;

    public OrientationEstimate(double w, double x, double y, double z) {
        double norm = Math.sqrt(w * w + x * x + y * y + z * z);
        if (norm < 1.0e-12) {
            throw new IllegalArgumentException("Quaternion magnitude must be greater than zero.");
        }

        this.w = w / norm;
        this.x = x / norm;
        this.y = y / norm;
        this.z = z / norm;

        this.rollRadians = Math.atan2(
                2.0 * (this.w * this.x + this.y * this.z),
                1.0 - 2.0 * (this.x * this.x + this.y * this.y));
        this.pitchRadians = Math.asin(2.0 * (this.w * this.y - this.z * this.x));
        this.yawRadians = Math.atan2(
                2.0 * (this.w * this.z + this.x * this.y),
                1.0 - 2.0 * (this.y * this.y + this.z * this.z));
    }

    public double getW() {
        return w;
    }

    public double getX() {
        return x;
    }

    public double getY() {
        return y;
    }

    public double getZ() {
        return z;
    }

    public double[] getQuaternion() {
        return Arrays.copyOf(new double[] {w, x, y, z}, 4);
    }

    public double getRollRadians() {
        return rollRadians;
    }

    public double getPitchRadians() {
        return pitchRadians;
    }

    public double getYawRadians() {
        return yawRadians;
    }

    @Override
    public String toString() {
        return "OrientationEstimate{" +
                "w=" + w +
                ", x=" + x +
                ", y=" + y +
                ", z=" + z +
                ", rollRadians=" + rollRadians +
                ", pitchRadians=" + pitchRadians +
                ", yawRadians=" + yawRadians +
                '}';
    }
}

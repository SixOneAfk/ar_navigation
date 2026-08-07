package com.example.indoorpositioning;

/**
 * Integrates acceleration into velocity and position using a simple dead-reckoning model.
 *
 * <p>Purpose: estimate motion from the processed acceleration signal without relying on GPS.</p>
 *
 * <p>Mathematical model:
 * <pre>
 * v_{k+1} = v_k + a_k \Delta t
 * p_{k+1} = p_k + v_k \Delta t
 * </pre>
 *
 * <p>Inputs:
 * <ul>
 *   <li>World-frame acceleration in meters per second squared</li>
 *   <li>A time step in seconds</li>
 * </ul>
 *
 * <p>Outputs:
 * <ul>
 *   <li>Velocity in meters per second</li>
 *   <li>Position in meters</li>
 * </ul>
 */
public final class DeadReckoningEstimator {
    private final double[] velocity;
    private final double[] position;

    public DeadReckoningEstimator() {
        this.velocity = new double[] {0.0, 0.0, 0.0};
        this.position = new double[] {0.0, 0.0, 0.0};
    }

    public double[] update(double[] accelerationWorld, double deltaSeconds) {
        if (accelerationWorld == null || accelerationWorld.length != 3) {
            throw new IllegalArgumentException("Acceleration must be a 3D vector.");
        }
        if (deltaSeconds < 0.0) {
            throw new IllegalArgumentException("Delta seconds must be non-negative.");
        }

        for (int i = 0; i < 3; i++) {
            velocity[i] += accelerationWorld[i] * deltaSeconds;
            position[i] += velocity[i] * deltaSeconds;
        }

        return getPosition();
    }

    public double[] getVelocity() {
        return new double[] {velocity[0], velocity[1], velocity[2]};
    }

    public double[] getPosition() {
        return new double[] {position[0], position[1], position[2]};
    }

    public void reset() {
        velocity[0] = 0.0;
        velocity[1] = 0.0;
        velocity[2] = 0.0;
        position[0] = 0.0;
        position[1] = 0.0;
        position[2] = 0.0;
    }
}

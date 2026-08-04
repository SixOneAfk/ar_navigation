package com.example.indoorpositioning;

/**
 * Integrates linear acceleration into velocity and position.
 *
 * <p>Purpose:
 * This class performs numerical integration of acceleration to estimate motion over time. It also
 * applies damping to reduce drift and detects stationary periods to prevent velocity buildup from
 * noise.</p>
 *
 * <p>Inputs:
 * <ul>
 *   <li>Linear acceleration in m/s²: {@code [ax, ay, az]}</li>
 *   <li>Delta time in seconds</li>
 * </ul>
 *
 * <p>Outputs:
 * <ul>
 *   <li>Velocity in m/s: {@code [vx, vy, vz]}</li>
 *   <li>Position in meters: {@code [x, y, z]}</li>
 * </ul>
 *
 * <p>Mathematical model:
 * The integrator uses the forward Euler method:
 * <pre>
 * v_{k+1} = v_k + a_k \Delta t
 * p_{k+1} = p_k + v_{k+1} \Delta t
 * </pre>
 * Damping is applied as
 * <pre>
 * v_{k+1} = v_{k+1} \cdot (1 - d)
 * </pre>
 * where {@code d} is the damping factor.</p>
 */
public final class MotionIntegrator {
    private static final double DEFAULT_DAMPING = 0.02;
    private static final double STATIONARY_THRESHOLD = 0.05;

    private final double dampingFactor;
    private final double stationaryThreshold;

    private double[] velocity;
    private double[] position;

    /**
     * Creates a motion integrator with default damping and stationary thresholds.
     */
    public MotionIntegrator() {
        this(DEFAULT_DAMPING, STATIONARY_THRESHOLD);
    }

    /**
     * Creates a motion integrator with custom damping and stationary thresholds.
     *
     * @param dampingFactor value in the range [0, 1]; larger values reduce drift more aggressively
     * @param stationaryThreshold magnitude threshold below which motion is considered stationary
     */
    public MotionIntegrator(double dampingFactor, double stationaryThreshold) {
        if (dampingFactor < 0.0 || dampingFactor >= 1.0) {
            throw new IllegalArgumentException("Damping factor must be in the range [0, 1)." );
        }
        if (stationaryThreshold < 0.0) {
            throw new IllegalArgumentException("Stationary threshold must be non-negative.");
        }

        this.dampingFactor = dampingFactor;
        this.stationaryThreshold = stationaryThreshold;
        this.velocity = new double[] {0.0, 0.0, 0.0};
        this.position = new double[] {0.0, 0.0, 0.0};
    }

    /**
     * Integrates one acceleration sample into velocity and position.
     *
     * @param acceleration linear acceleration in m/s² as {@code [ax, ay, az]}
     * @param deltaSeconds elapsed time in seconds
     * @return updated position as {@code [x, y, z]}
     */
    public double[] update(double[] acceleration, double deltaSeconds) {
        if (acceleration == null || acceleration.length != 3) {
            throw new IllegalArgumentException("Acceleration must be a 3D vector [ax, ay, az].");
        }
        if (deltaSeconds < 0.0) {
            throw new IllegalArgumentException("Delta time must be non-negative.");
        }

        if (isStationary(acceleration)) {
            resetVelocity();
            return getPosition();
        }

        integrateVelocity(acceleration, deltaSeconds);
        integratePosition(deltaSeconds);

        return getPosition();
    }

    /**
     * Returns the current velocity estimate.
     */
    public double[] getVelocity() {
        return new double[] {velocity[0], velocity[1], velocity[2]};
    }

    /**
     * Returns the current position estimate.
     */
    public double[] getPosition() {
        return new double[] {position[0], position[1], position[2]};
    }

    /**
     * Resets velocity and position to zero.
     */
    public void reset() {
        velocity[0] = 0.0;
        velocity[1] = 0.0;
        velocity[2] = 0.0;
        position[0] = 0.0;
        position[1] = 0.0;
        position[2] = 0.0;
    }

    private boolean isStationary(double[] acceleration) {
        double magnitude = Math.sqrt(
                acceleration[0] * acceleration[0] +
                acceleration[1] * acceleration[1] +
                acceleration[2] * acceleration[2]);
        return magnitude <= stationaryThreshold;
    }

    private void resetVelocity() {
        velocity[0] = 0.0;
        velocity[1] = 0.0;
        velocity[2] = 0.0;
    }

    private void integrateVelocity(double[] acceleration, double deltaSeconds) {
        for (int i = 0; i < 3; i++) {
            velocity[i] += acceleration[i] * deltaSeconds;
            velocity[i] *= 1.0 - dampingFactor;
        }
    }

    private void integratePosition(double deltaSeconds) {
        for (int i = 0; i < 3; i++) {
            position[i] += velocity[i] * deltaSeconds;
        }
    }
}

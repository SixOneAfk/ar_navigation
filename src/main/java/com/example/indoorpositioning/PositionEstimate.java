package com.example.indoorpositioning;

/**
 * Final output of the indoor positioning pipeline.
 *
 * <p>Purpose: expose the estimated position and traveled distance in a single object.</p>
 *
 * <p>Inputs:
 * <ul>
 *   <li>Position coordinates in meters</li>
 *   <li>Distance traveled in meters</li>
 * </ul>
 *
 * <p>Outputs:
 * <ul>
 *   <li>A simple immutable value object for downstream consumers</li>
 * </ul>
 */
public final class PositionEstimate {
    private final double xMeters;
    private final double yMeters;
    private final double zMeters;
    private final double distanceTraveledMeters;

    public PositionEstimate(double xMeters, double yMeters, double zMeters, double distanceTraveledMeters) {
        this.xMeters = xMeters;
        this.yMeters = yMeters;
        this.zMeters = zMeters;
        this.distanceTraveledMeters = distanceTraveledMeters;
    }

    public double getXMeters() {
        return xMeters;
    }

    public double getYMeters() {
        return yMeters;
    }

    public double getZMeters() {
        return zMeters;
    }

    public double getDistanceTraveledMeters() {
        return distanceTraveledMeters;
    }

    @Override
    public String toString() {
        return "PositionEstimate{" +
                "xMeters=" + xMeters +
                ", yMeters=" + yMeters +
                ", zMeters=" + zMeters +
                ", distanceTraveledMeters=" + distanceTraveledMeters +
                '}';
    }
}

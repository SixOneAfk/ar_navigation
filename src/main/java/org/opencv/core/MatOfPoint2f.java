package org.opencv.core;

public class MatOfPoint2f {
    private Point[] points = new Point[0];

    public MatOfPoint2f() {}

    public void release() {}

    public void fromArray(Point[] points) {
        this.points = points != null ? points : new Point[0];
    }

    public Point[] toArray() {
        return points;
    }

    public MatOfPoint2f clone() {
        MatOfPoint2f clone = new MatOfPoint2f();
        clone.fromArray(points);
        return clone;
    }
}

package com.example.indoorpositioning;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

import org.opencv.core.Core;
import org.opencv.core.CvType;
import org.opencv.core.Mat;
import org.opencv.core.MatOfByte;
import org.opencv.core.MatOfFloat;
import org.opencv.core.MatOfPoint;
import org.opencv.core.MatOfPoint2f;
import org.opencv.core.Point;
import org.opencv.core.Size;
import org.opencv.core.TermCriteria;
import org.opencv.imgproc.Imgproc;
import org.opencv.video.Video;
import org.opencv.videoio.VideoCapture;

/**
 * Tracks image features from a camera stream and estimates camera translation between consecutive frames.
 *
 * <p>Purpose:
 * This class is intended for visual odometry-style motion estimation in an indoor positioning pipeline.
 * It uses Shi-Tomasi corner detection and Lucas-Kanade optical flow to track points across frames.
 * Outliers are removed before estimating a translation vector.</p>
 *
 * <p>Inputs:
 * <ul>
 *   <li>A live camera stream</li>
 * </ul>
 *
 * <p>Outputs:
 * <ul>
 *   <li>A 2D translation estimate in pixels: {@code [dx, dy]}</li>
 * </ul>
 */
public final class CameraTracker {
    static {
        System.loadLibrary(Core.NATIVE_LIBRARY_NAME);
    }

    private static final int MAX_FEATURES = 500;
    private static final double QUALITY_LEVEL = 0.01;
    private static final double MIN_DISTANCE = 3.0;
    private static final int BLOCK_SIZE = 3;
    private static final int WIN_SIZE = 21;
    private static final int MAX_LEVELS = 3;
    private static final double OUTLIER_THRESHOLD = 5.0;

    private final VideoCapture capture;
    private final Mat grayFrame;
    private final Mat previousGrayFrame;
    private final MatOfPoint2f previousPoints;
    private final MatOfPoint2f currentPoints;
    private final MatOfByte status;
    private final MatOfFloat error;
    private boolean hasPreviousFrame;

    /**
     * Creates a tracker and opens the camera at the given index.
     *
     * @param cameraIndex index of the camera device, usually 0 for the built-in camera
     */
    public CameraTracker(int cameraIndex) {
        this.capture = new VideoCapture(cameraIndex);
        this.grayFrame = new Mat();
        this.previousGrayFrame = new Mat();
        this.previousPoints = new MatOfPoint2f();
        this.currentPoints = new MatOfPoint2f();
        this.status = new MatOfByte();
        this.error = new MatOfFloat();
        this.hasPreviousFrame = false;
    }

    /**
     * Reads the next frame from the camera, tracks features, and returns the estimated translation.
     *
     * @return a 2D translation vector in pixels as {@code [dx, dy]}, or {@code null} if no frame was read
     */
    public double[] update() {
        Mat frame = new Mat();
        if (!capture.read(frame)) {
            frame.release();
            return null;
        }

        Imgproc.cvtColor(frame, grayFrame, Imgproc.COLOR_BGR2GRAY);

        if (!hasPreviousFrame) {
            detectFeatures(grayFrame);
            grayFrame.copyTo(previousGrayFrame);
            hasPreviousFrame = true;
            frame.release();
            return new double[] {0.0, 0.0};
        }

        MatOfPoint2f oldPoints = previousPoints.clone();
        MatOfPoint2f newPoints = new MatOfPoint2f();
        Video.calcOpticalFlowPyrLK(
                previousGrayFrame,
                grayFrame,
                oldPoints,
                newPoints,
                status,
                error,
                new Size(WIN_SIZE, WIN_SIZE),
                MAX_LEVELS,
                new TermCriteria(TermCriteria.COUNT + TermCriteria.EPS, 30, 0.01),
                0,
                1e-4);

        double[] translation = estimateTranslation(oldPoints, newPoints, status);
        grayFrame.copyTo(previousGrayFrame);
        previousPoints.release();
        previousPoints.fromArray(toPointArray(newPoints));

        frame.release();
        oldPoints.release();
        newPoints.release();
        return translation;
    }

    /**
     * Releases the camera resource.
     */
    public void release() {
        capture.release();
        grayFrame.release();
        previousGrayFrame.release();
        previousPoints.release();
        currentPoints.release();
        status.release();
        error.release();
    }

    private void detectFeatures(Mat image) {
        MatOfPoint corners = new MatOfPoint();
        Imgproc.goodFeaturesToTrack(
                image,
                corners,
                MAX_FEATURES,
                QUALITY_LEVEL,
                MIN_DISTANCE,
                new Mat(),
                BLOCK_SIZE,
                false,
                0.04);

        Point[] points = corners.toArray();
        previousPoints.fromArray(points);
        corners.release();
    }

    private double[] estimateTranslation(MatOfPoint2f previous, MatOfPoint2f current, MatOfByte status) {
        Point[] previousPointsArray = previous.toArray();
        Point[] currentPointsArray = current.toArray();
        byte[] statusArray = status.toArray();

        List<Double> displacements = new ArrayList<>();
        List<Double> displacementX = new ArrayList<>();
        List<Double> displacementY = new ArrayList<>();

        for (int i = 0; i < previousPointsArray.length; i++) {
            if (statusArray.length <= i || statusArray[i] == 0) {
                continue;
            }

            double dx = currentPointsArray[i].x - previousPointsArray[i].x;
            double dy = currentPointsArray[i].y - previousPointsArray[i].y;
            double magnitude = Math.sqrt(dx * dx + dy * dy);

            if (magnitude < 1.0e-6) {
                continue;
            }

            displacements.add(magnitude);
            displacementX.add(dx);
            displacementY.add(dy);
        }

        if (displacements.isEmpty()) {
            return new double[] {0.0, 0.0};
        }

        double medianMagnitude = median(displacements);
        double medianDx = median(displacementX);
        double medianDy = median(displacementY);

        double sumDx = 0.0;
        double sumDy = 0.0;
        int count = 0;

        for (int i = 0; i < previousPointsArray.length; i++) {
            if (statusArray.length <= i || statusArray[i] == 0) {
                continue;
            }

            double dx = currentPointsArray[i].x - previousPointsArray[i].x;
            double dy = currentPointsArray[i].y - previousPointsArray[i].y;
            double magnitude = Math.sqrt(dx * dx + dy * dy);

            if (magnitude > OUTLIER_THRESHOLD * medianMagnitude + 1.0e-6) {
                continue;
            }

            double dxDeviation = Math.abs(dx - medianDx);
            double dyDeviation = Math.abs(dy - medianDy);
            if (dxDeviation > OUTLIER_THRESHOLD * medianMagnitude + 1.0e-6 ||
                    dyDeviation > OUTLIER_THRESHOLD * medianMagnitude + 1.0e-6) {
                continue;
            }

            sumDx += dx;
            sumDy += dy;
            count++;
        }

        if (count == 0) {
            return new double[] {0.0, 0.0};
        }

        return new double[] {sumDx / count, sumDy / count};
    }

    private double median(List<Double> values) {
        List<Double> sorted = new ArrayList<>(values);
        Collections.sort(sorted);
        int middle = sorted.size() / 2;
        if (sorted.size() % 2 == 0) {
            return (sorted.get(middle - 1) + sorted.get(middle)) / 2.0;
        }
        return sorted.get(middle);
    }

    private Point[] toPointArray(MatOfPoint2f points) {
        return points.toArray();
    }
}

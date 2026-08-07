package org.opencv.imgproc;

import org.opencv.core.Mat;
import org.opencv.core.MatOfPoint;

public final class Imgproc {
    public static final int COLOR_BGR2GRAY = 6;

    private Imgproc() {}

    public static void cvtColor(Mat src, Mat dst, int code) {}

    public static void goodFeaturesToTrack(
            Mat image,
            MatOfPoint corners,
            int maxCorners,
            double qualityLevel,
            double minDistance,
            Mat mask,
            int blockSize,
            boolean useHarrisDetector,
            double k) {}
}

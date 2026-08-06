package org.opencv.video;

import org.opencv.core.Mat;
import org.opencv.core.MatOfByte;
import org.opencv.core.MatOfFloat;
import org.opencv.core.MatOfPoint2f;
import org.opencv.core.Size;
import org.opencv.core.TermCriteria;

public final class Video {
    private Video() {}

    public static void calcOpticalFlowPyrLK(
            Mat prevImg,
            Mat nextImg,
            MatOfPoint2f prevPts,
            MatOfPoint2f nextPts,
            MatOfByte status,
            MatOfFloat err,
            Size winSize,
            int maxLevel,
            TermCriteria criteria,
            int flags,
            double minEigThreshold) {}
}

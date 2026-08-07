package org.opencv.core;

public class TermCriteria {
    public static final int COUNT = 1;
    public static final int EPS = 2;

    public int type;
    public int maxCount;
    public double epsilon;

    public TermCriteria(int type, int maxCount, double epsilon) {
        this.type = type;
        this.maxCount = maxCount;
        this.epsilon = epsilon;
    }
}

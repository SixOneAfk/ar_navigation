package org.opencv.core;

public class MatOfByte {
    private byte[] data = new byte[0];

    public MatOfByte() {}

    public void release() {}

    public byte[] toArray() {
        return data;
    }
}

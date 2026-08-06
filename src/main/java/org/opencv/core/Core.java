package org.opencv.core;

public final class Core {
    public static final String NATIVE_LIBRARY_NAME = "opencv_java";

    private Core() {}

    public static void loadLibrary(String libraryName) {
        // No-op for local compatibility in the editor/build environment.
    }
}

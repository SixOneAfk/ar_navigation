package com.example.indoorpositioning;

/**
 * Shared vector and quaternion helpers used across the positioning pipeline.
 */
final class VectorMath {
    private static final double EPSILON = 1.0e-12;

    private VectorMath() {
    }

    static double[] normalize(double[] vector) {
        double norm = magnitude(vector);
        if (norm <= EPSILON) {
            return new double[] {1.0, 0.0, 0.0, 0.0};
        }

        double[] normalized = new double[vector.length];
        for (int i = 0; i < vector.length; i++) {
            normalized[i] = vector[i] / norm;
        }
        return normalized;
    }

    static double magnitude(double[] vector) {
        double sum = 0.0;
        for (double value : vector) {
            sum += value * value;
        }
        return Math.sqrt(sum);
    }

    static double[] rotateQuaternionToMatrix(double[] quaternion, double[] vector) {
        double w = quaternion[0];
        double x = quaternion[1];
        double y = quaternion[2];
        double z = quaternion[3];

        double[][] rotationMatrix = new double[3][3];
        rotationMatrix[0][0] = 1.0 - 2.0 * (y * y + z * z);
        rotationMatrix[0][1] = 2.0 * (x * y - z * w);
        rotationMatrix[0][2] = 2.0 * (x * z + y * w);

        rotationMatrix[1][0] = 2.0 * (x * y + z * w);
        rotationMatrix[1][1] = 1.0 - 2.0 * (x * x + z * z);
        rotationMatrix[1][2] = 2.0 * (y * z - x * w);

        rotationMatrix[2][0] = 2.0 * (x * z - y * w);
        rotationMatrix[2][1] = 2.0 * (y * z + x * w);
        rotationMatrix[2][2] = 1.0 - 2.0 * (x * x + y * y);

        return new double[] {
                rotationMatrix[0][0] * vector[0] + rotationMatrix[0][1] * vector[1] + rotationMatrix[0][2] * vector[2],
                rotationMatrix[1][0] * vector[0] + rotationMatrix[1][1] * vector[1] + rotationMatrix[1][2] * vector[2],
                rotationMatrix[2][0] * vector[0] + rotationMatrix[2][1] * vector[1] + rotationMatrix[2][2] * vector[2]
        };
    }
}
